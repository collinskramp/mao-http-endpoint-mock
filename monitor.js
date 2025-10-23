#!/usr/bin/env node

const http = require('http');

// Configuration
const config = {
  baseUrl: 'http://localhost:8080',
  monitorInterval: 2000, // Check every 2 seconds
  healthEndpoint: '/health'
};

// Colors
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

let monitoringData = {
  startTime: Date.now(),
  healthChecks: 0,
  serviceAvailable: 0,
  serviceUnavailable: 0,
  lastMetrics: null,
  responseTimeHistory: []
};

// Make health check request
function checkHealth() {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const req = http.request({
      hostname: 'localhost',
      port: 8080,
      path: config.healthEndpoint,
      method: 'GET',
      timeout: 5000
    }, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        
        try {
          const parsedData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            responseTime: responseTime,
            data: parsedData,
            available: res.statusCode < 400
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            responseTime: responseTime,
            data: { raw: data },
            available: res.statusCode < 400
          });
        }
      });
    });

    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      reject({
        error: error.message,
        responseTime: responseTime,
        available: false
      });
    });

    req.on('timeout', () => {
      req.destroy();
      const responseTime = Date.now() - startTime;
      reject({
        error: 'Health check timeout',
        responseTime: responseTime,
        available: false
      });
    });

    req.end();
  });
}

// Display monitoring dashboard
function displayDashboard(healthResult, isError = false) {
  const runtime = (Date.now() - monitoringData.startTime) / 1000;
  const availability = monitoringData.healthChecks > 0 
    ? ((monitoringData.serviceAvailable / monitoringData.healthChecks) * 100).toFixed(1)
    : 0;

  // Clear screen
  console.clear();
  
  // Header
  console.log(`${colors.bright}${colors.blue}📊 API Service Monitor Dashboard${colors.reset}`);
  console.log(`${colors.dim}${'='.repeat(70)}${colors.reset}\n`);
  
  // Service status
  const statusIcon = isError ? '🔴' : (healthResult.statusCode < 400 ? '🟢' : '🟡');
  const statusText = isError ? 'UNREACHABLE' : 
                    (healthResult.statusCode < 400 ? 'HEALTHY' : 'DEGRADED');
  const statusColor = isError ? colors.red : 
                     (healthResult.statusCode < 400 ? colors.green : colors.yellow);
  
  console.log(`${colors.bright}Service Status: ${statusIcon} ${statusColor}${statusText}${colors.reset}`);
  console.log(`${colors.white}Monitoring Time: ${colors.cyan}${Math.floor(runtime)}s${colors.reset}`);
  console.log(`${colors.white}Availability: ${colors.green}${availability}%${colors.reset} (${monitoringData.serviceAvailable}/${monitoringData.healthChecks})\n`);
  
  // Current health check result
  console.log(`${colors.bright}🏥 Current Health Check${colors.reset}`);
  if (isError) {
    console.log(`${colors.red}❌ ${healthResult.error}${colors.reset}`);
    console.log(`${colors.white}Response Time: ${colors.yellow}${healthResult.responseTime}ms${colors.reset}\n`);
  } else {
    console.log(`${colors.white}Status Code: ${healthResult.statusCode < 400 ? colors.green : colors.yellow}${healthResult.statusCode}${colors.reset}`);
    console.log(`${colors.white}Response Time: ${colors.yellow}${healthResult.responseTime}ms${colors.reset}\n`);
  }
  
  // Service metrics (if available)
  if (!isError && healthResult.data && healthResult.data.service_metrics) {
    const metrics = healthResult.data.service_metrics;
    monitoringData.lastMetrics = metrics;
    
    console.log(`${colors.bright}🔧 Service Internal Metrics${colors.reset}`);
    console.log(`${colors.white}Total API Requests: ${colors.cyan}${metrics.total_requests}${colors.reset}`);
    console.log(`${colors.white}API Success Rate: ${colors.green}${metrics.success_rate}${colors.reset}`);
    console.log(`${colors.white}Failed Requests: ${colors.red}${metrics.failed_requests}${colors.reset}`);
    console.log(`${colors.white}Average Response Time: ${colors.yellow}${metrics.average_response_time_ms}ms${colors.reset}`);
    console.log(`${colors.white}Current Response Time: ${colors.yellow}${metrics.current_response_time_ms}ms${colors.reset}`);
    console.log(`${colors.white}Service Healthy: ${metrics.service_healthy ? colors.green + 'Yes' : colors.red + 'No'}${colors.reset}`);
    console.log(`${colors.white}In Normal Period: ${metrics.in_normal_period ? colors.green + 'Yes' : colors.yellow + 'No'}${colors.reset}`);
    console.log(`${colors.white}Circuit Breaker Errors: ${colors.magenta}${metrics.circuit_breaker_errors}${colors.reset}\n`);
  }
  
  // Behavior configuration (if available)
  if (!isError && healthResult.data && healthResult.data.behavior_config) {
    const config = healthResult.data.behavior_config;
    
    console.log(`${colors.bright}⚙️  Service Configuration${colors.reset}`);
    console.log(`${colors.white}Base Success Rate: ${colors.green}${config.base_success_rate}${colors.reset}`);
    console.log(`${colors.white}Slow Response Chance: ${colors.yellow}${config.slow_response_chance}${colors.reset}`);
    console.log(`${colors.white}Outage Chance: ${colors.red}${config.outage_chance_per_request}${colors.reset}\n`);
  }
  
  // Response time history (last 10 checks)
  if (monitoringData.responseTimeHistory.length > 0) {
    console.log(`${colors.bright}📈 Response Time Trend (last 10 checks)${colors.reset}`);
    const history = monitoringData.responseTimeHistory.slice(-10);
    const maxTime = Math.max(...history);
    const barWidth = 30;
    
    history.forEach((time, index) => {
      const barLength = Math.round((time / maxTime) * barWidth);
      const bar = '█'.repeat(barLength) + '░'.repeat(barWidth - barLength);
      const color = time > 1000 ? colors.red : time > 500 ? colors.yellow : colors.green;
      console.log(`  ${color}${bar}${colors.reset} ${time}ms`);
    });
    console.log('');
  }
  
  // Instructions
  console.log(`${colors.dim}Press Ctrl+C to stop monitoring | Checking every ${config.monitorInterval/1000}s${colors.reset}`);
}

// Run monitoring loop
async function startMonitoring() {
  console.log(`${colors.bright}${colors.blue}🔍 Starting API Service Monitor${colors.reset}`);
  console.log(`${colors.white}Target: ${colors.cyan}${config.baseUrl}${config.healthEndpoint}${colors.reset}\n`);
  
  const monitor = setInterval(async () => {
    try {
      const result = await checkHealth();
      monitoringData.healthChecks++;
      
      if (result.available) {
        monitoringData.serviceAvailable++;
      } else {
        monitoringData.serviceUnavailable++;
      }
      
      monitoringData.responseTimeHistory.push(result.responseTime);
      if (monitoringData.responseTimeHistory.length > 20) {
        monitoringData.responseTimeHistory.shift();
      }
      
      displayDashboard(result, false);
      
    } catch (error) {
      monitoringData.healthChecks++;
      monitoringData.serviceUnavailable++;
      
      monitoringData.responseTimeHistory.push(error.responseTime || 5000);
      if (monitoringData.responseTimeHistory.length > 20) {
        monitoringData.responseTimeHistory.shift();
      }
      
      displayDashboard(error, true);
    }
  }, config.monitorInterval);
  
  // Handle shutdown
  process.on('SIGINT', () => {
    clearInterval(monitor);
    
    const runtime = (Date.now() - monitoringData.startTime) / 1000;
    const availability = monitoringData.healthChecks > 0 
      ? ((monitoringData.serviceAvailable / monitoringData.healthChecks) * 100).toFixed(1)
      : 0;
    
    console.log(`\n${colors.bright}${colors.green}📊 Monitoring Summary${colors.reset}`);
    console.log(`${colors.white}Total Runtime: ${colors.cyan}${Math.floor(runtime)}s${colors.reset}`);
    console.log(`${colors.white}Health Checks: ${colors.cyan}${monitoringData.healthChecks}${colors.reset}`);
    console.log(`${colors.white}Service Availability: ${colors.green}${availability}%${colors.reset}`);
    console.log(`${colors.white}Available: ${colors.green}${monitoringData.serviceAvailable}${colors.reset}`);
    console.log(`${colors.white}Unavailable: ${colors.red}${monitoringData.serviceUnavailable}${colors.reset}\n`);
    
    process.exit(0);
  });
  
  // Run first check immediately
  try {
    const result = await checkHealth();
    monitoringData.healthChecks++;
    monitoringData.serviceAvailable++;
    monitoringData.responseTimeHistory.push(result.responseTime);
    displayDashboard(result, false);
  } catch (error) {
    monitoringData.healthChecks++;
    monitoringData.serviceUnavailable++;
    monitoringData.responseTimeHistory.push(error.responseTime || 5000);
    displayDashboard(error, true);
  }
}

// Start monitoring
startMonitoring().catch(error => {
  console.error(`${colors.red}Monitor failed: ${error.message}${colors.reset}`);
  process.exit(1);
});
