#!/usr/bin/env node

const https = require('https');
const http = require('http');

// Configuration
const config = {
  // Your deployed Cloud Run URL
  baseUrl: 'https://kramphub-product-items-update-sync-mockv2-50273148900.europe-west1.run.app',
  // For local testing, use: 'http://localhost:8080'
  
  // Test configuration
  totalRequests: 100,
  concurrentRequests: 5,
  requestInterval: 1000, // 1 second between batches
  monitorInterval: 5000, // 5 seconds between status reports
  testDuration: 300000, // 5 minutes total test duration
};

// Statistics tracking
const stats = {
  total: 0,
  success: 0,
  errors: {
    network: 0,
    timeout: 0,
    server_error: 0,
    client_error: 0,
    service_unavailable: 0,
    circuit_breaker: 0,
    dropped: 0
  },
  responseTimes: [],
  statusCodes: {},
  startTime: Date.now(),
  lastHealthCheck: null
};

// Test scenarios
const testScenarios = [
  { method: 'GET', path: '/health', name: 'Health Check' },
  { method: 'GET', path: '/?name=TestUser', name: 'Hello GET' },
  { method: 'POST', path: '/', body: { name: 'TestUser' }, name: 'Hello POST' },
  { method: 'POST', path: '/api/data', body: { data: 'test' }, name: 'Generic POST' },
  { method: 'GET', path: '/api/users', name: 'Generic GET' },
  { method: 'PUT', path: '/api/users/1', body: { id: 1, name: 'Updated' }, name: 'PUT Request' },
  { method: 'DELETE', path: '/api/users/1', name: 'DELETE Request' },
];

// Colors for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m'
};

// Make HTTP request with timeout
function makeRequest(method, path, body = null, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseUrl + path);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'API-Tester/1.0'
      },
      timeout: timeout
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const startTime = Date.now();
    const req = httpModule.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        let parsedData = null;
        
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          parsedData = { raw_response: data };
        }
        
        resolve({
          statusCode: res.statusCode,
          responseTime: responseTime,
          data: parsedData,
          headers: res.headers
        });
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      reject({
        error: error.message,
        responseTime: responseTime,
        type: 'network'
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      reject({
        error: 'Request timeout',
        responseTime: responseTime,
        type: 'timeout'
      });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

// Process request result
function processResult(scenario, result, isError = false) {
  stats.total++;
  
  if (isError) {
    const errorType = result.type || 'unknown';
    stats.errors[errorType] = (stats.errors[errorType] || 0) + 1;
    
    console.log(`${colors.red}✗${colors.reset} ${scenario.name}: ${colors.red}${result.error}${colors.reset} (${result.responseTime}ms)`);
  } else {
    stats.success++;
    stats.responseTimes.push(result.responseTime);
    
    const statusCode = result.statusCode;
    stats.statusCodes[statusCode] = (stats.statusCodes[statusCode] || 0) + 1;
    
    // Categorize errors by status code
    if (statusCode >= 500) {
      stats.errors.server_error++;
    } else if (statusCode >= 400) {
      if (statusCode === 503) {
        if (result.data && result.data.error_type === 'circuit_breaker_open') {
          stats.errors.circuit_breaker++;
        } else {
          stats.errors.service_unavailable++;
        }
      } else {
        stats.errors.client_error++;
      }
    }
    
    const statusColor = statusCode >= 500 ? colors.red : 
                       statusCode >= 400 ? colors.yellow : colors.green;
    
    console.log(`${colors.green}✓${colors.reset} ${scenario.name}: ${statusColor}${statusCode}${colors.reset} (${result.responseTime}ms)`);
    
    // Store health check data
    if (scenario.name === 'Health Check' && result.data && result.data.service_metrics) {
      stats.lastHealthCheck = result.data;
    }
  }
}

// Display statistics
function displayStats() {
  const runtime = Date.now() - stats.startTime;
  const successRate = stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(2) : 0;
  const avgResponseTime = stats.responseTimes.length > 0 
    ? (stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length).toFixed(2)
    : 0;
  
  console.log(`\n${colors.cyan}${colors.bright}=== API Test Statistics ===${colors.reset}`);
  console.log(`${colors.white}Runtime: ${colors.cyan}${Math.round(runtime/1000)}s${colors.reset}`);
  console.log(`${colors.white}Total Requests: ${colors.cyan}${stats.total}${colors.reset}`);
  console.log(`${colors.white}Success Rate: ${colors.green}${successRate}%${colors.reset} (${stats.success}/${stats.total})`);
  console.log(`${colors.white}Average Response Time: ${colors.yellow}${avgResponseTime}ms${colors.reset}`);
  
  // Error breakdown
  console.log(`\n${colors.yellow}Error Breakdown:${colors.reset}`);
  Object.entries(stats.errors).forEach(([type, count]) => {
    if (count > 0) {
      const percentage = ((count / stats.total) * 100).toFixed(1);
      console.log(`  ${colors.red}${type}:${colors.reset} ${count} (${percentage}%)`);
    }
  });
  
  // Status codes
  console.log(`\n${colors.blue}Status Codes:${colors.reset}`);
  Object.entries(stats.statusCodes).forEach(([code, count]) => {
    const percentage = ((count / stats.total) * 100).toFixed(1);
    const codeColor = code >= 500 ? colors.red : code >= 400 ? colors.yellow : colors.green;
    console.log(`  ${codeColor}${code}:${colors.reset} ${count} (${percentage}%)`);
  });
  
  // Service metrics from last health check
  if (stats.lastHealthCheck && stats.lastHealthCheck.service_metrics) {
    const metrics = stats.lastHealthCheck.service_metrics;
    console.log(`\n${colors.magenta}Service Metrics (from API):${colors.reset}`);
    console.log(`  Total Requests: ${metrics.total_requests}`);
    console.log(`  API Success Rate: ${metrics.success_rate}`);
    console.log(`  Avg Response Time: ${metrics.average_response_time_ms}ms`);
    console.log(`  Service Healthy: ${metrics.service_healthy ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
    console.log(`  In Normal Period: ${metrics.in_normal_period ? colors.green + 'Yes' : colors.yellow + 'No'}${colors.reset}`);
    console.log(`  Circuit Breaker Errors: ${metrics.circuit_breaker_errors}`);
  }
  
  console.log(`${colors.cyan}${colors.bright}==============================${colors.reset}\n`);
}

// Run a batch of concurrent requests
async function runRequestBatch() {
  const promises = [];
  
  for (let i = 0; i < config.concurrentRequests; i++) {
    const scenario = testScenarios[Math.floor(Math.random() * testScenarios.length)];
    
    const promise = makeRequest(scenario.method, scenario.path, scenario.body)
      .then(result => processResult(scenario, result, false))
      .catch(error => processResult(scenario, error, true));
    
    promises.push(promise);
  }
  
  await Promise.all(promises);
}

// Main test function
async function runTest() {
  console.log(`${colors.bright}${colors.cyan}🚀 Starting API Load Test${colors.reset}`);
  console.log(`${colors.white}Target URL: ${colors.yellow}${config.baseUrl}${colors.reset}`);
  console.log(`${colors.white}Test Duration: ${colors.yellow}${config.testDuration/1000}s${colors.reset}`);
  console.log(`${colors.white}Concurrent Requests: ${colors.yellow}${config.concurrentRequests}${colors.reset}`);
  console.log(`${colors.white}Request Interval: ${colors.yellow}${config.requestInterval}ms${colors.reset}\n`);
  
  // Set up monitoring interval
  const monitorInterval = setInterval(displayStats, config.monitorInterval);
  
  // Set up test completion timer
  const testTimer = setTimeout(() => {
    clearInterval(monitorInterval);
    clearInterval(requestInterval);
    
    console.log(`${colors.bright}${colors.green}🏁 Test completed!${colors.reset}\n`);
    displayStats();
    
    // Final summary
    console.log(`${colors.bright}${colors.blue}Test Summary:${colors.reset}`);
    console.log(`This test demonstrated the realistic API behavior including:`);
    console.log(`• Random failures and timeouts`);
    console.log(`• Service outages and circuit breaker patterns`);
    console.log(`• Variable response times and delays`);
    console.log(`• Different HTTP status codes and error types\n`);
    
    process.exit(0);
  }, config.testDuration);
  
  // Start making requests
  const requestInterval = setInterval(async () => {
    try {
      await runRequestBatch();
    } catch (error) {
      console.log(`${colors.red}Batch error: ${error.message}${colors.reset}`);
    }
  }, config.requestInterval);
  
  // Run first batch immediately
  await runRequestBatch();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(`\n${colors.yellow}Test interrupted by user${colors.reset}`);
  displayStats();
  process.exit(0);
});

// Validate configuration
if (!config.baseUrl || config.baseUrl.includes('your-project')) {
  console.log(`${colors.red}${colors.bright}⚠️  Configuration Required${colors.reset}`);
  console.log(`${colors.yellow}Please update the baseUrl in the config section with your actual Cloud Function URL${colors.reset}`);
  console.log(`${colors.white}For local testing, use: ${colors.cyan}http://localhost:8080${colors.reset}`);
  console.log(`${colors.white}For deployed function, use: ${colors.cyan}https://REGION-PROJECT.cloudfunctions.net/helloHttp${colors.reset}\n`);
  process.exit(1);
}

// Start the test
runTest().catch(error => {
  console.error(`${colors.red}Test failed: ${error.message}${colors.reset}`);
  process.exit(1);
});
