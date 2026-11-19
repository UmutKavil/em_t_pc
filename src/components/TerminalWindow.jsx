import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

export default function TerminalWindow() {
  const terminalRef = useRef(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const title =
      new URLSearchParams(window.location.search).get("title") || "Mac Terminal";
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"DM Mono", Menlo, Monaco, monospace',
      fontSize: 13,
      theme: {
        background: "#05070b",
        foreground: "#dce5f8",
        cursor: "#61dac7",
        selectionBackground: "#34466a",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);

    const fit = () => fitAddon.fit();
    fit();
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(terminalRef.current);

    let inputBuffer = "";
    let running = false;

    terminal.writeln(`\x1b[1;36mEM T PC — ${title}\x1b[0m`);
    terminal.writeln("Gerçek macOS komutları çalışır.");
    terminal.writeln("");
    terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");

    const disposable = terminal.onData(async (data) => {
      if (running) return;

      if (data === "\r") {
        const command = inputBuffer;
        inputBuffer = "";
        terminal.write("\r\n");

        if (!command.trim()) {
          terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
          return;
        }

        if (/^FLAG\{[^}]+\}$/.test(command.trim())) {
          try {
            await invoke("verify_student_flag", { flag: command.trim() });
            terminal.write("\x1b[1;32mGörev bayrağı doğrulandı!\x1b[0m\r\n");
          } catch (error) {
            terminal.write(`\x1b[1;31mHata:\x1b[0m ${String(error)}\r\n`);
          }
          terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
          running = false;
          return;
        }

        running = true;
        try {
          const result = await invoke("execute_terminal_command", { command });
          if (result.output) {
            terminal.write(result.output.replace(/\n/g, "\r\n"));
            if (!result.output.endsWith("\n")) terminal.write("\r\n");
          }

          const cwdName = result.cwd.split("/").filter(Boolean).pop() || "/";
          terminal.write(`\x1b[1;32m➜\x1b[0m \x1b[1;34m~/${cwdName}\x1b[0m $ `);
        } catch (error) {
          terminal.write(`\x1b[1;31mHata:\x1b[0m ${String(error)}\r\n`);
          terminal.write("\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
        } finally {
          running = false;
        }
      } else if (data === "\u007f") {
        if (inputBuffer.length > 0) {
          inputBuffer = inputBuffer.slice(0, -1);
          terminal.write("\b \b");
        }
      } else if (data === "\u0003") {
        inputBuffer = "";
        terminal.write("^C\r\n\x1b[1;32m➜\x1b[0m \x1b[1;34m~\x1b[0m $ ");
      } else if (!data.startsWith("\u001b")) {
        inputBuffer += data;
        terminal.write(data);
      }
    });

    terminal.focus();
    return () => {
      disposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, []);

  return <main className="standalone-terminal" ref={terminalRef} />;
}
