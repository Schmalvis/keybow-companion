use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, Mutex};

const IPC_ADDR: &str = "127.0.0.1:23847";
const BROADCAST_CAPACITY: usize = 64;

pub struct IpcServer {
    tx: broadcast::Sender<String>,
    shutdown: Arc<Mutex<Option<tokio::sync::oneshot::Sender<()>>>>,
}

impl IpcServer {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            tx,
            shutdown: Arc::new(Mutex::new(None)),
        }
    }

    /// Start the IPC server on the default address.
    pub async fn start<F, G>(&self, on_message: F, on_client_change: G) -> Result<std::net::SocketAddr, String>
    where
        F: Fn(serde_json::Value) + Send + Sync + 'static,
        G: Fn(bool) + Send + Sync + 'static,
    {
        self.start_on(IPC_ADDR, on_message, on_client_change).await
    }

    /// Start the IPC server on a custom address. Returns the bound address.
    pub async fn start_on<F, G>(&self, addr: &str, on_message: F, on_client_change: G) -> Result<std::net::SocketAddr, String>
    where
        F: Fn(serde_json::Value) + Send + Sync + 'static,
        G: Fn(bool) + Send + Sync + 'static,
    {
        let listener = TcpListener::bind(addr)
            .await
            .map_err(|e| format!("Failed to bind IPC server on {}: {}", addr, e))?;

        let bound_addr = listener.local_addr()
            .map_err(|e| format!("Failed to get local addr: {}", e))?;

        log::info!("IPC server listening on {}", bound_addr);

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel();
        {
            let mut guard = self.shutdown.lock().await;
            *guard = Some(shutdown_tx);
        }

        let tx = self.tx.clone();
        let on_message = Arc::new(on_message);
        let on_client_change = Arc::new(on_client_change);

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((stream, addr)) => {
                                log::info!("IPC client connected: {}", addr);
                                on_client_change(true);
                                let tx = tx.clone();
                                let mut rx = tx.subscribe();
                                let on_message = on_message.clone();
                                let on_client_change = on_client_change.clone();

                                tokio::spawn(async move {
                                    let (reader, writer) = stream.into_split();
                                    let mut reader = BufReader::new(reader);
                                    let writer = Arc::new(Mutex::new(writer));

                                    // Task: forward broadcast messages to this client
                                    let writer_clone = writer.clone();
                                    let write_task = tokio::spawn(async move {
                                        while let Ok(msg) = rx.recv().await {
                                            let mut w = writer_clone.lock().await;
                                            let line = format!("{}\n", msg);
                                            if w.write_all(line.as_bytes()).await.is_err() {
                                                break;
                                            }
                                        }
                                    });

                                    // Task: read lines from client
                                    let mut line = String::new();
                                    loop {
                                        line.clear();
                                        match reader.read_line(&mut line).await {
                                            Ok(0) => break, // EOF
                                            Ok(_) => {
                                                let trimmed = line.trim();
                                                if !trimmed.is_empty() {
                                                    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
                                                        on_message(value);
                                                    } else {
                                                        log::warn!("IPC: invalid JSON from {}: {}", addr, trimmed);
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                log::warn!("IPC read error from {}: {}", addr, e);
                                                break;
                                            }
                                        }
                                    }

                                    write_task.abort();
                                    log::info!("IPC client disconnected: {}", addr);
                                    on_client_change(false);
                                });
                            }
                            Err(e) => {
                                log::warn!("IPC accept error: {}", e);
                            }
                        }
                    }
                    _ = &mut shutdown_rx => {
                        log::info!("IPC server shutting down");
                        break;
                    }
                }
            }
        });

        Ok(bound_addr)
    }

    /// Broadcast a JSON message to all connected clients.
    pub fn broadcast(&self, message: &serde_json::Value) {
        let msg = message.to_string();
        // Ignore error if no receivers
        let _ = self.tx.send(msg);
    }

    /// Returns true if at least one client is connected (subscribed to broadcasts).
    pub fn has_clients(&self) -> bool {
        self.tx.receiver_count() > 0
    }

    /// Stop the IPC server.
    pub async fn stop(&self) {
        let mut guard = self.shutdown.lock().await;
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
        }
    }

    /// Returns the address the server listens on.
    pub fn address() -> &'static str {
        IPC_ADDR
    }
}

impl Default for IpcServer {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::TcpStream;

    #[tokio::test]
    async fn server_starts_and_stops() {
        let server = IpcServer::new();
        let addr = server.start_on("127.0.0.1:0", |_| {}, |_| {}).await.unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let stream = TcpStream::connect(addr).await;
        assert!(stream.is_ok());

        server.stop().await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    #[tokio::test]
    async fn client_receives_broadcast() {
        let server = IpcServer::new();
        let addr = server.start_on("127.0.0.1:0", |_| {}, |_| {}).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let stream = TcpStream::connect(addr).await.unwrap();
        let mut reader = BufReader::new(stream);

        let msg = serde_json::json!({"type": "test", "data": "hello"});
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        server.broadcast(&msg);

        let mut line = String::new();
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            reader.read_line(&mut line),
        )
        .await;

        assert!(result.is_ok());
        let parsed: serde_json::Value = serde_json::from_str(line.trim()).unwrap();
        assert_eq!(parsed["type"], "test");
        assert_eq!(parsed["data"], "hello");

        server.stop().await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    #[tokio::test]
    async fn server_receives_client_messages() {
        let counter = Arc::new(AtomicUsize::new(0));
        let counter_clone = counter.clone();

        let server = IpcServer::new();
        let addr = server
            .start_on("127.0.0.1:0", move |_| {
                counter_clone.fetch_add(1, Ordering::SeqCst);
            }, |_| {})
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let mut stream = TcpStream::connect(addr).await.unwrap();

        stream
            .write_all(b"{\"action\":\"test\"}\n")
            .await
            .unwrap();
        stream.flush().await.unwrap();

        tokio::time::sleep(std::time::Duration::from_millis(100)).await;

        assert_eq!(counter.load(Ordering::SeqCst), 1);

        server.stop().await;
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    }

    #[tokio::test]
    async fn client_change_callback_fires_on_connect_and_disconnect() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let connect_count = Arc::new(AtomicUsize::new(0));
        let disconnect_count = Arc::new(AtomicUsize::new(0));
        let cc = connect_count.clone();
        let dc = disconnect_count.clone();

        let server = IpcServer::new();
        let addr = server
            .start_on("127.0.0.1:0", |_| {}, move |connected| {
                if connected {
                    cc.fetch_add(1, Ordering::SeqCst);
                } else {
                    dc.fetch_add(1, Ordering::SeqCst);
                }
            })
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;

        let stream = TcpStream::connect(addr).await.unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        assert_eq!(connect_count.load(Ordering::SeqCst), 1);

        drop(stream);
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        assert_eq!(disconnect_count.load(Ordering::SeqCst), 1);

        server.stop().await;
    }
}
