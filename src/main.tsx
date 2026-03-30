import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles/app.css";
import "./styles/wizard.css";

createRoot(document.getElementById("root")!).render(<App />);
