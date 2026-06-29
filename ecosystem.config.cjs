module.exports = {
  apps: [{
    name: 'opencode-os',
    script: 'dist/index.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    cron_restart: '0 */3 * * *',
    env: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    kill_timeout: 10000,
    wait_ready: false,
    listen_timeout: 30000,
  }]
}
