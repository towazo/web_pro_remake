const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = Math.max(1, Number(process.env.PORT) || 8787);
const HOST = '127.0.0.1';
const HEALTH_PATH = '/api/health';
const serverEntry = path.join(__dirname, 'server.js');

const probeHealth = () => new Promise((resolve) => {
  const request = http.request(
    {
      host: HOST,
      port: PORT,
      path: HEALTH_PATH,
      method: 'GET',
      timeout: 1200,
    },
    (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        if (response.statusCode !== 200) {
          resolve(false);
          return;
        }

        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(Boolean(payload?.ok));
        } catch (_) {
          resolve(false);
        }
      });
    }
  );

  request.on('timeout', () => request.destroy(new Error('health_timeout')));
  request.on('error', () => resolve(false));
  request.end();
});

const isPortBusy = () => new Promise((resolve) => {
  const socket = net.connect({ host: HOST, port: PORT });
  let settled = false;

  const finish = (value) => {
    if (settled) return;
    settled = true;
    socket.destroy();
    resolve(value);
  };

  socket.setTimeout(1200);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(true));
  socket.once('error', (error) => {
    if (error?.code === 'ECONNREFUSED') {
      finish(false);
      return;
    }
    finish(true);
  });
});

const holdProcess = () => {
  const timer = setInterval(() => {}, 1 << 30);
  const cleanupAndExit = () => {
    clearInterval(timer);
    process.exit(0);
  };

  process.once('SIGINT', cleanupAndExit);
  process.once('SIGTERM', cleanupAndExit);
};

const spawnServerProcess = () => {
  const child = spawn(process.execPath, [serverEntry], {
    stdio: 'inherit',
    env: process.env,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.once('SIGINT', () => forwardSignal('SIGINT'));
  process.once('SIGTERM', () => forwardSignal('SIGTERM'));

  child.once('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.once('error', (error) => {
    console.error('[dev-server] failed to start backend:', error?.message || error);
    process.exit(1);
  });
};

const main = async () => {
  if (await probeHealth()) {
    console.log(`[dev-server] reusing existing backend on http://localhost:${PORT}`);
    holdProcess();
    return;
  }

  if (await isPortBusy()) {
    console.error(
      `[dev-server] port ${PORT} is already in use, but /api/health did not respond. Stop the conflicting process or change PORT.`
    );
    process.exit(1);
    return;
  }

  spawnServerProcess();
};

main().catch((error) => {
  console.error('[dev-server] unexpected startup error:', error?.message || error);
  process.exit(1);
});
