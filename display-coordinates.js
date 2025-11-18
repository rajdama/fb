import electron from "electron";
const { app, BrowserWindow, ipcMain, screen } = electron;
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createWindow() {
  // Create preload script
  const preloadScript = `
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  receiveCoords: (callback) => {
    ipcRenderer.on('coords', (event, pos) => {
      callback(pos);
    });
  }
});
`;

  // Write preload script to file
  const preloadPath = path.join(__dirname, 'preload_temp.js');
  await fs.writeFile(preloadPath, preloadScript);

  const win = new BrowserWindow({
    width: 200,
    height: 80,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath
    }
  });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            margin: 0;
            background: rgba(0, 0, 0, 0.6);
            color: #0f0;
            font-family: monospace;
            font-size: 22px;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100vw;
            height: 100vh;
        }
        #coords {
            padding: 10px;
        }
    </style>
</head>
<body>
    <div id="coords">Loading...</div>
    
    <script>
        if (window.electronAPI && window.electronAPI.receiveCoords) {
            window.electronAPI.receiveCoords((pos) => {
                document.getElementById("coords").textContent = "X:" + pos.x + " Y:" + pos.y;
            });
        } else {
            document.getElementById("coords").textContent = "No API";
        }
    </script>
</body>
</html>
  `;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

  // Track mouse position
  setInterval(() => {
    try {
      const point = screen.getCursorScreenPoint();
      win.webContents.send("coords", point);
    } catch (error) {
      console.error('Error getting mouse position:', error);
    }
  }, 50);

  // Clean up on window close
  win.on('closed', async () => {
    try {
      await fs.unlink(preloadPath);
    } catch (e) {
      // Ignore cleanup errors
    }
  });
}

app.whenReady().then(() => createWindow());

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});