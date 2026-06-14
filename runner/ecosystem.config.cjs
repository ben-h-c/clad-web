// PM2 config for the agent runner. Start with:
//   cd runner && npm install && pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "clad-agent-runner",
      script: "index.mjs",
      interpreter: "node",
      // Load runner/.env via Node's built-in flag (PM2's env_file is unreliable
      // across versions). cwd is the runner dir so .env resolves correctly.
      node_args: "--env-file=.env",
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
