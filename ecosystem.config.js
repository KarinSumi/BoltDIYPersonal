module.exports = {
  apps: [{
    name: 'opencode-os',
    script: 'dist/index.js',
    env_file: '.env',
    max_restarts: 10,
    restart_delay: 100,
    exp_backoff_restart_delay: 100,
    min_uptime: '10s',
    watch: false,
    kill_timeout: 5000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-output.log',
    merge_logs: true,
  }]
}
