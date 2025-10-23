# 🚀 Cloud Run Deployment Guide

## Current Status
Your Cloud Run service is showing a placeholder page instead of your mock API. Here's how to fix it:

## 📋 Deployment Checklist

### 1. Verify Your Project Structure
Make sure you have these files in your deployment directory:
```
mao.mock.service.js     # Your main service file
package.json           # Dependencies and scripts
```

### 2. Required package.json for Cloud Run
```json
{
  "name": "realistic-mock-api",
  "version": "1.0.0",
  "main": "mao.mock.service.js",
  "scripts": {
    "start": "functions-framework --target=helloHttp --source=."
  },
  "dependencies": {
    "@google-cloud/functions-framework": "^3.4.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 3. Cloud Run Deployment Commands

#### Option A: Deploy from Local Code
```bash
# From your project directory containing mao.mock.service.js
gcloud run deploy kramphub-product-items-update-sync-mockv2 \
  --source . \
  --platform managed \
  --region europe-west1 \
  --allow-unauthenticated \
  --port 8080 \
  --project kramp-appint-dev
```

#### Option B: Check Current Deployment
```bash
# Check service status
gcloud run services describe kramphub-product-items-update-sync-mockv2 \
  --region europe-west1 \
  --project kramp-appint-dev

# Check recent deployments
gcloud run revisions list \
  --service kramphub-product-items-update-sync-mockv2 \
  --region europe-west1 \
  --project kramp-appint-dev
```

## 🔍 Troubleshooting

### Check Build Logs
1. Go to: https://console.cloud.google.com/run/detail/europe-west1/kramphub-product-items-update-sync-mockv2/revisions?project=kramp-appint-dev
2. Click on "Build History"
3. Look for any build failures

### Common Issues
1. **Missing package.json**: Cloud Run needs proper Node.js configuration
2. **Wrong entry point**: Make sure the functions-framework targets `helloHttp`
3. **Build failures**: Check for dependency issues or syntax errors

## 🧪 Test Once Fixed

Once deployed correctly, your health endpoint should return:
```json
{
  "status": "success",
  "message": "Realistic mock service is running",
  "version": "2.0.0",
  "service_metrics": {
    "total_requests": 1,
    "success_rate": "100.00%",
    // ... more metrics
  }
}
```

Instead of the HTML placeholder page you're currently seeing.

## 📞 Quick Fix Command

Try this quick deployment command:
```bash
cd /path/to/your/mock/api/code
gcloud run deploy kramphub-product-items-update-sync-mockv2 \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --project kramp-appint-dev
```
