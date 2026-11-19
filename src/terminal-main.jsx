import React from "react";
import ReactDOM from "react-dom/client";
import TerminalWindow from "./components/TerminalWindow";
import "./terminal.css";

ReactDOM.createRoot(document.getElementById("terminal-root")).render(
  <React.StrictMode>
    <TerminalWindow />
  </React.StrictMode>,
);
