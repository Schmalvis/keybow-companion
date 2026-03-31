use std::io::{self, Read, Write};
use std::net::TcpStream;

const IPC_PORT: u16 = 23847;

fn read_chrome_message<R: Read>(reader: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut first = [0u8; 1];
    match reader.read(&mut first) {
        Ok(0) => return Ok(None), // clean EOF
        Ok(_) => {}
        Err(e) => return Err(e),
    }
    let mut rest = [0u8; 3];
    reader.read_exact(&mut rest)?;
    let len = u32::from_le_bytes([first[0], rest[0], rest[1], rest[2]]) as usize;
    let mut buf = vec![0u8; len];
    reader.read_exact(&mut buf)?;
    Ok(Some(buf))
}

fn write_chrome_message<W: Write>(writer: &mut W, data: &[u8]) -> io::Result<()> {
    let len = (data.len() as u32).to_le_bytes();
    writer.write_all(&len)?;
    writer.write_all(data)?;
    writer.flush()
}

fn main() {
    let mut write_stream = TcpStream::connect(("127.0.0.1", IPC_PORT))
        .expect("native-host: failed to connect to IPC server");

    let mut read_stream = write_stream.try_clone().expect("native-host: stream clone failed");

    // TCP → Chrome stdout: read newline-delimited lines, write with Chrome framing
    std::thread::spawn(move || {
        let stdout = io::stdout();
        let mut stdout = stdout.lock();
        let mut line_buf = Vec::new();
        let mut byte = [0u8; 1];
        loop {
            match read_stream.read(&mut byte) {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    if byte[0] == b'\n' {
                        if !line_buf.is_empty() {
                            write_chrome_message(&mut stdout, &line_buf).ok();
                            line_buf.clear();
                        }
                    } else {
                        line_buf.push(byte[0]);
                    }
                }
            }
        }
    });

    // Chrome stdin → TCP: read Chrome framing, write as newline-delimited
    let stdin = io::stdin();
    let mut stdin = stdin.lock();
    loop {
        match read_chrome_message(&mut stdin) {
            Ok(Some(msg)) => {
                write_stream.write_all(&msg).ok();
                write_stream.write_all(b"\n").ok();
            }
            Ok(None) | Err(_) => break,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn round_trip_encodes_and_decodes() {
        let msg = b"{\"action\":\"openTab\",\"url\":\"https://example.com\"}";
        let mut buf = Vec::new();
        write_chrome_message(&mut buf, msg).unwrap();
        let mut cursor = Cursor::new(buf);
        let result = read_chrome_message(&mut cursor).unwrap();
        assert_eq!(result, Some(msg.to_vec()));
    }

    #[test]
    fn clean_eof_returns_none() {
        let mut cursor = Cursor::new(vec![]);
        let result = read_chrome_message(&mut cursor).unwrap();
        assert_eq!(result, None);
    }

    #[test]
    fn length_prefix_is_little_endian() {
        let msg = b"hello";
        let mut buf = Vec::new();
        write_chrome_message(&mut buf, msg).unwrap();
        assert_eq!(&buf[..4], &[5u8, 0, 0, 0]);
        assert_eq!(&buf[4..], b"hello");
    }
}
