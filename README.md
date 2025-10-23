# Realistic Mock API Service & Load Tester

A Google Cloud Function that simulates real-world API behavior with failures, delays, outages, and circuit breaker patterns. Includes comprehensive testing and monitoring tools.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Local Service
```bash
npm run start-local
```
This starts the mock API on `http://localhost:8080`

### 3. Run Load Tests (in separate terminals)

**Option A: Real-time monitoring dashboard**
```bash
npm run monitor
```

**Option B: Load testing with statistics**
```bash
npm run test-local
```

**Option C: Full load test (for deployed functions)**
```bash
# Edit test-api.js to set your deployed function URL first
npm test
```

## 📊 What the API Simulates

### Success Patterns
- **95% base success rate** under normal conditions
- **100% success periods** lasting 5-30 minutes randomly
- **Realistic response times** with occasional delays

### Failure Scenarios
- **5% request drops** (network simulation)
- **Server errors (500)**: 2% chance
- **Client errors (400)**: 1% chance  
- **Timeouts (408)**: 0.5% chance
- **Service outages**: 1-3 minutes randomly
- **Circuit breaker**: Opens after 10 errors in 1 minute

### Delays & Performance
- **15% of requests** get 500ms-2s artificial delays
- **Variable response times** simulating database/external calls
- **Performance metrics** tracking and reporting

## 🧪 Testing Tools

### 1. Monitor Dashboard (`npm run monitor`)
- Real-time service health monitoring
- Response time trends
- Service availability tracking
- Internal metrics from the API

### 2. Load Tester (`npm run test-local`)
- Concurrent request simulation
- Multiple request scenarios
- Real-time statistics
- Error categorization
- Success rate analysis

### 3. Cloud Function Tester (`npm test`)
- For testing deployed functions
- Higher concurrent loads
- Extended test durations
- Production-like scenarios

## 📋 API Endpoints

### Health Check
```bash
GET /health
```
Returns detailed service metrics and configuration

### Hello Endpoints
```bash
# GET with query parameter
GET /?name=YourName

# POST with JSON body
POST /
Content-Type: application/json
{"name": "YourName"}
```

### Generic Endpoints
Any other endpoint will respond with mock data and realistic behavior patterns.

## 🔧 Configuration

### Service Behavior (in `mao.mock.service.js`)
```javascript
const config = {
  baseSuccessRate: 0.95,        // 95% success rate
  slowResponseChance: 0.15,     // 15% slow responses
  outageChance: 0.001,          // 0.1% outage chance
  serverErrorChance: 0.02,      // 2% server errors
  // ... more settings
};
```

### Test Configuration (in test files)
```javascript
const config = {
  concurrentRequests: 3,        // Parallel requests
  requestInterval: 800,         // Time between batches
  testDuration: 120000,         // 2 minutes
  // ... more settings  
};
```

## 📈 Understanding Results

### Success Rates
- **Client Success Rate**: Successful responses from client perspective
- **Service Success Rate**: Internal API metrics (may differ due to timing)
- **Dropped Requests**: Connections that were terminated (network simulation)

### Response Times
- **Base response time**: Normal processing time
- **Artificial delays**: Added simulation delays
- **Total response time**: Complete round-trip time

### Error Types
- **network**: Connection issues
- **timeout**: Request timeouts
- **server_error**: HTTP 5xx responses  
- **client_error**: HTTP 4xx responses
- **service_unavailable**: HTTP 503 during outages
- **circuit_breaker**: Requests blocked by circuit breaker
- **dropped**: Simulated network drops

## 🎯 Use Cases

- **Frontend Development**: Test API resilience handling
- **Load Testing**: Simulate real-world API conditions  
- **Monitoring Setup**: Test alerting and monitoring systems
- **Circuit Breaker Testing**: Validate client-side circuit breakers
- **Timeout Handling**: Test client timeout configurations
- **Retry Logic**: Validate exponential backoff strategies

## 🚀 Deployment

### Deploy to Google Cloud Functions
```bash
gcloud functions deploy helloHttp \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated \
  --source .
```

### Update Test Configuration
After deployment, update the `baseUrl` in `test-api.js` with your function URL:
```javascript
baseUrl: 'https://REGION-PROJECT.cloudfunctions.net/helloHttp'
```

## 🔍 Monitoring Production

The API provides detailed metrics at `/health`:
- Request counts and success rates
- Response time statistics  
- Service health status
- Circuit breaker state
- Current operational mode

Perfect for integration with monitoring systems like Prometheus, Datadog, or custom dashboards.

---

**Happy Testing!** 🎉

This mock service helps you build more resilient applications by testing against realistic API behavior patterns.
# mao-http-endpoint-mock
