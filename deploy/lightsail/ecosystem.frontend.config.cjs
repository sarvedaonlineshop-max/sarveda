/** PM2 app for the Lightsail preview. Does not manage the API process. */
module.exports = {
  apps: [
    {
      name: "sarveda-frontend-preview",
      cwd: "./frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      env: {
        NODE_ENV: "production",
        BACKEND_PROXY_URL: "http://127.0.0.1:5000",
        INTERNAL_API_URL: "http://127.0.0.1:5000"
      }
    }
  ]
};
