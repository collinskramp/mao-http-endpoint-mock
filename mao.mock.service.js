const functions = require('@google-cloud/functions-framework');  

// Service state management
let serviceState = {
  isHealthy: true,
  lastOutageStart: null,
  outageEndTime: null,
  normalPeriodStart: Date.now(),
  normalPeriodDuration: null,
  requestCount: 0,
  successCount: 0,
  errorCount: 0,
  averageResponseTime: 0
};

// Configuration for realistic behavior
const config = {
  baseSuccessRate: 0.95,
  outageChance: 0.0001,
  minOutageDuration: 15000,
  maxOutageDuration: 45000,
  slowResponseChance: 0.15,
  minSlowDelay: 500,
  maxSlowDelay: 2000,
  normalPeriodChance: 0.002,
  minNormalPeriod: 300000,
  maxNormalPeriod: 1800000,
  serverErrorChance: 0.01,
  clientErrorChance: 0.005,
  timeoutChance: 0.002,
  circuitBreakerThreshold: 15,
  circuitBreakerWindow: 60000,
  circuitBreakerRecovery: 20000,
  circuitBreakerHalfOpenRequests: 2,
  // --- Production twerks ---
  rateLimitWindowMs: 10000, // 10s window
  rateLimitMax: 50 // max 50 requests per window per IP
};

// Simple in-memory rate limiter (per IP)
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > config.rateLimitWindowMs) {
    entry = { count: 1, start: now };
    rateLimitMap.set(ip, entry);
    return false;
  }
  entry.count++;
  if (entry.count > config.rateLimitMax) return true;
  return false;
}

// Structured JSON logger
function logJson(obj) {
  console.log(JSON.stringify(obj));
}

// Error tracking for circuit breaker
let errorWindow = [];
let circuitBreakerState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
let circuitBreakerOpenTime = null;
let halfOpenAttempts = 0;

// Helper function to generate request ID  
function generateRequestId() {  
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;  
}

// Check if service should be in outage
function checkServiceAvailability() {
  const now = Date.now();
  
  // Check if we're currently in an outage
  if (serviceState.outageEndTime && now < serviceState.outageEndTime) {
    return false;
  }
  
  // End outage if time has passed
  if (serviceState.outageEndTime && now >= serviceState.outageEndTime) {
    serviceState.isHealthy = true;
    serviceState.outageEndTime = null;
    serviceState.lastOutageStart = null;
    console.log(`Service recovered from outage at ${new Date().toISOString()}`);
  }
  
  // Check if we should start a new outage
  if (serviceState.isHealthy && Math.random() < config.outageChance) {
    const outageStart = now;
    const outageDuration = Math.random() * (config.maxOutageDuration - config.minOutageDuration) + config.minOutageDuration;
    
    serviceState.isHealthy = false;
    serviceState.lastOutageStart = outageStart;
    serviceState.outageEndTime = outageStart + outageDuration;
    
    console.log(`Service outage started at ${new Date().toISOString()}, duration: ${Math.round(outageDuration/1000)}s`);
    return false;
  }
  
  return serviceState.isHealthy;
}

// Check if we're in a normal period (100% success rate)
function isInNormalPeriod() {
  const now = Date.now();
  
  // Check if current normal period has ended
  if (serviceState.normalPeriodDuration && 
      (now - serviceState.normalPeriodStart) > serviceState.normalPeriodDuration) {
    serviceState.normalPeriodDuration = null;
    console.log(`Normal period ended at ${new Date().toISOString()}`);
  }
  
  // Start new normal period
  if (!serviceState.normalPeriodDuration && Math.random() < config.normalPeriodChance) {
    serviceState.normalPeriodStart = now;
    serviceState.normalPeriodDuration = Math.random() * (config.maxNormalPeriod - config.minNormalPeriod) + config.minNormalPeriod;
    console.log(`Normal period started at ${new Date().toISOString()}, duration: ${Math.round(serviceState.normalPeriodDuration/60000)} minutes`);
  }
  
  return !!serviceState.normalPeriodDuration;
}

// Circuit breaker check with proper state management
function isCircuitBreakerOpen() {
  const now = Date.now();
  
  // Clean old errors from window
  errorWindow = errorWindow.filter(timestamp => now - timestamp < config.circuitBreakerWindow);
  
  // Handle circuit breaker state transitions
  switch (circuitBreakerState) {
    case 'CLOSED':
      // Check if we should open the circuit breaker
      if (errorWindow.length >= config.circuitBreakerThreshold) {
        circuitBreakerState = 'OPEN';
        circuitBreakerOpenTime = now;
        console.log(`Circuit breaker OPENED at ${new Date().toISOString()} due to ${errorWindow.length} errors`);
        return true;
      }
      return false;
      
    case 'OPEN':
      // Check if recovery time has passed
      if (now - circuitBreakerOpenTime >= config.circuitBreakerRecovery) {
        circuitBreakerState = 'HALF_OPEN';
        halfOpenAttempts = 0;
        console.log(`Circuit breaker moved to HALF_OPEN at ${new Date().toISOString()}`);
        return false; // Allow the first request through
      }
      return true; // Still open
      
    case 'HALF_OPEN':
      // In half-open state, allow limited requests through
      return false;
      
    default:
      return false;
  }
}

// Add error to circuit breaker tracking with state management
function recordError() {
  const now = Date.now();
  errorWindow.push(now);
  serviceState.errorCount++;
  
  // Handle half-open state failures
  if (circuitBreakerState === 'HALF_OPEN') {
    circuitBreakerState = 'OPEN';
    circuitBreakerOpenTime = now;
    halfOpenAttempts = 0;
    console.log(`Circuit breaker REOPENED at ${new Date().toISOString()} due to failure in half-open state`);
  }
}

// Record successful request for circuit breaker
function recordSuccess() {
  serviceState.successCount++;
  
  // Handle half-open state successes
  if (circuitBreakerState === 'HALF_OPEN') {
    halfOpenAttempts++;
    if (halfOpenAttempts >= config.circuitBreakerHalfOpenRequests) {
      circuitBreakerState = 'CLOSED';
      halfOpenAttempts = 0;
      // Clear some old errors to help recovery
      const cutoff = Date.now() - (config.circuitBreakerWindow / 2);
      errorWindow = errorWindow.filter(timestamp => timestamp > cutoff);
      console.log(`Circuit breaker CLOSED at ${new Date().toISOString()} after successful half-open period`);
    }
  }
}

// Simulate various error scenarios
function simulateError() {
  const rand = Math.random();
  
  if (rand < config.serverErrorChance) {
    return { status: 500, error: 'Internal Server Error', type: 'server_error' };
  }
  
  if (rand < config.serverErrorChance + config.clientErrorChance) {
    return { status: 400, error: 'Bad Request', type: 'client_error' };
  }
  
  if (rand < config.serverErrorChance + config.clientErrorChance + config.timeoutChance) {
    return { status: 408, error: 'Request Timeout', type: 'timeout' };
  }
  
  return null;
}

// Add artificial delay
async function addDelay() {
  if (Math.random() < config.slowResponseChance) {
    const delay = Math.random() * (config.maxSlowDelay - config.minSlowDelay) + config.minSlowDelay;
    console.log(`Adding artificial delay: ${Math.round(delay)}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
  }
  return 0;
}  

functions.http('helloHttp', async (req, res) => {
  const requestStart = Date.now();
  const requestId = generateRequestId();
  serviceState.requestCount++;
  
  // Enable CORS  
  res.set('Access-Control-Allow-Origin', '*');  
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');  
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');  

  // Handle preflight requests  
  if (req.method === 'OPTIONS') {  
    res.status(204).send('');  
    return;  
  }  


  // Log the request with service state (structured)
  logJson({
    type: 'request',
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    requestId,
    ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    serviceState: {
      healthy: serviceState.isHealthy,
      requests: serviceState.requestCount,
      success_rate: ((serviceState.successCount/serviceState.requestCount)*100).toFixed(2)
    },
    body: req.body || null
  });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
  if (checkRateLimit(ip)) {
    recordError();
    const responseTime = Date.now() - requestStart;
    logJson({
      type: 'rate_limit',
      requestId,
      ip,
      responseTime,
      message: 'Rate limit exceeded'
    });
    res.status(429).json({
      status: 'error',
      message: 'Too many requests',
      timestamp: new Date().toISOString(),
      requestId,
      error_type: 'rate_limit',
      retry_after: Math.ceil(config.rateLimitWindowMs/1000)
    });
    return;
  }

  try {
    const path = req.url || req.path || '/';

    // Check service availability first
    if (!checkServiceAvailability()) {
      recordError();
      const responseTime = Date.now() - requestStart;
      console.log(`Service unavailable - rejecting request [${requestId}] after ${responseTime}ms`);
      
      res.status(503).json({
        status: 'error',
        message: 'Service temporarily unavailable',
        timestamp: new Date().toISOString(),
        requestId: requestId,
        error_type: 'service_unavailable',
        retry_after: Math.round((serviceState.outageEndTime - Date.now()) / 1000)
      });
      return;
    }

    // Check circuit breaker
    if (isCircuitBreakerOpen()) {
      recordError();
      const responseTime = Date.now() - requestStart;
      console.log(`Circuit breaker open - rejecting request [${requestId}] after ${responseTime}ms`);
      
      res.status(503).json({
        status: 'error',
        message: 'Circuit breaker open - too many recent failures',
        timestamp: new Date().toISOString(),
        requestId: requestId,
        error_type: 'circuit_breaker_open',
        retry_after: 30,
        circuit_breaker_state: circuitBreakerState,
        recovery_time_remaining: circuitBreakerState === 'OPEN' ? 
          Math.max(0, Math.round((config.circuitBreakerRecovery - (Date.now() - circuitBreakerOpenTime)) / 1000)) : 0
      });
      return;
    }

    // Add artificial delays
    const artificialDelay = await addDelay();

    // Check if we're in normal period (100% success rate)
    const inNormalPeriod = isInNormalPeriod();
    
    // Simulate errors (unless in normal period)
    if (!inNormalPeriod) {
      const errorScenario = simulateError();
      if (errorScenario) {
        recordError();
        const responseTime = Date.now() - requestStart;
        console.log(`Simulated ${errorScenario.type} error for request [${requestId}] after ${responseTime}ms`);
        
        res.status(errorScenario.status).json({
          status: 'error',
          message: errorScenario.error,
          timestamp: new Date().toISOString(),
          requestId: requestId,
          error_type: errorScenario.type,
          response_time_ms: responseTime
        });
        return;
      }

      // Graceful request drop (simulate network issues with 504)
      const successRate = config.baseSuccessRate;
      if (Math.random() > successRate) {
        recordError();
        const responseTime = Date.now() - requestStart;
        logJson({
          type: 'network_failure',
          requestId,
          responseTime,
          message: 'Simulated network failure (504)'
        });
        res.status(504).json({
          status: 'error',
          message: 'Simulated network failure (gateway timeout)',
          timestamp: new Date().toISOString(),
          requestId,
          error_type: 'network_failure',
          response_time_ms: responseTime
        });
        return;
      }
    }

    // Process successful requests
    recordSuccess();
    
    // Health check endpoint with detailed metrics
    if (path === '/' || path === '/health') {
      const responseTime = Date.now() - requestStart;
      serviceState.averageResponseTime = ((serviceState.averageResponseTime * (serviceState.requestCount - 1)) + responseTime) / serviceState.requestCount;
      
      const healthData = {
        status: 'success',
        message: 'Realistic mock service is running',
        timestamp: new Date().toISOString(),
        version: '2.1.1',
        requestId: requestId,
        service_metrics: {
          total_requests: serviceState.requestCount,
          successful_requests: serviceState.successCount,
          failed_requests: serviceState.errorCount,
          success_rate: ((serviceState.successCount / serviceState.requestCount) * 100).toFixed(2) + '%',
          average_response_time_ms: Math.round(serviceState.averageResponseTime),
          current_response_time_ms: responseTime,
          in_normal_period: inNormalPeriod,
          service_healthy: serviceState.isHealthy,
          circuit_breaker_errors: errorWindow.length,
          circuit_breaker_state: circuitBreakerState,
          half_open_attempts: halfOpenAttempts
        },
        behavior_config: {
          base_success_rate: (config.baseSuccessRate * 100) + '%',
          slow_response_chance: (config.slowResponseChance * 100) + '%',
          outage_chance_per_request: (config.outageChance * 100) + '%'
        },
        hint: 'This service simulates real-world API behavior with failures, delays, and outages'
      };

      console.log(`Successful health check [${requestId}] processed in ${responseTime}ms`);
      res.status(200).json(healthData);
      return;
    }

    // Circuit breaker reset endpoint
    if (path === '/reset-circuit-breaker' && req.method === 'POST') {
      const responseTime = Date.now() - requestStart;
      
      // Reset circuit breaker state
      circuitBreakerState = 'CLOSED';
      circuitBreakerOpenTime = null;
      halfOpenAttempts = 0;
      errorWindow = [];
      
      console.log(`Circuit breaker manually reset [${requestId}] at ${new Date().toISOString()}`);
      
      res.status(200).json({
        status: 'success',
        message: 'Circuit breaker has been reset',
        timestamp: new Date().toISOString(),
        requestId: requestId,
        response_time_ms: responseTime,
        circuit_breaker_state: circuitBreakerState,
        hint: 'Circuit breaker is now CLOSED and ready to accept requests'
      });
      return;
    }

    // Handle GET requests - including the original hello functionality  
    if (req.method === 'GET') {
      const responseTime = Date.now() - requestStart;
      serviceState.averageResponseTime = ((serviceState.averageResponseTime * (serviceState.requestCount - 1)) + responseTime) / serviceState.requestCount;
      
      // Original hello functionality  
      if (req.query.name) {
        console.log(`Successful GET hello [${requestId}] processed in ${responseTime}ms`);
        res.status(200).json({
          message: `Hello ${req.query.name}!`,
          requestId: requestId,
          response_time_ms: responseTime,
          timestamp: new Date().toISOString(),
          artificial_delay_ms: artificialDelay,
          in_normal_period: inNormalPeriod
        });
        return;
      }

      // Default GET response
      console.log(`Successful GET [${requestId}] processed in ${responseTime}ms`);
      res.status(200).json({
        message: 'Hello World!',
        requestId: requestId,
        response_time_ms: responseTime,
        timestamp: new Date().toISOString(),
        artificial_delay_ms: artificialDelay,
        in_normal_period: inNormalPeriod
      });
      return;
    }

    // Handle POST requests with basic input validation
    if (req.method === 'POST') {
      const requestData = req.body || {};
      const responseTime = Date.now() - requestStart;
      serviceState.averageResponseTime = ((serviceState.averageResponseTime * (serviceState.requestCount - 1)) + responseTime) / serviceState.requestCount;

      // Basic input validation: require 'name' for hello
      if (path === '/hello' && !requestData.name) {
        recordError();
        logJson({
          type: 'validation_error',
          requestId,
          responseTime,
          message: 'Missing required field: name'
        });
        res.status(400).json({
          status: 'error',
          message: 'Missing required field: name',
          requestId,
          error_type: 'validation_error',
          response_time_ms: responseTime
        });
        return;
      }

      // Original hello functionality for POST  
      if (requestData.name) {
        logJson({
          type: 'post_hello',
          requestId,
          responseTime,
          name: requestData.name
        });
        res.status(200).json({
          message: `Hello ${requestData.name}!`,
          requestId: requestId,
          response_time_ms: responseTime,
          timestamp: new Date().toISOString(),
          artificial_delay_ms: artificialDelay,
          in_normal_period: inNormalPeriod,
          received_data: requestData
        });
        return;
      }

      // Mock service response for POST without name
      const response = {
        status: 'success',
        message: 'Request processed successfully',
        timestamp: new Date().toISOString(),
        requestId: requestId,
        endpoint: path,
        method: req.method,
        receivedData: requestData,
        processedAt: new Date().toISOString(),
        response_time_ms: responseTime,
        artificial_delay_ms: artificialDelay,
        in_normal_period: inNormalPeriod,
        hint: 'Include {"name": "YourName"} in body for hello functionality'
      };

      logJson({
        type: 'post_generic',
        requestId,
        responseTime,
        receivedData: requestData
      });
      res.status(200).json(response);
      return;
    }

    // Handle other HTTP methods
    const responseTime = Date.now() - requestStart;
    serviceState.averageResponseTime = ((serviceState.averageResponseTime * (serviceState.requestCount - 1)) + responseTime) / serviceState.requestCount;
    
    console.log(`Successful ${req.method} [${requestId}] processed in ${responseTime}ms`);
    res.status(200).json({
      status: 'success',
      message: `${req.method} request processed`,
      timestamp: new Date().toISOString(),
      requestId: requestId,
      endpoint: path,
      method: req.method,
      response_time_ms: responseTime,
      artificial_delay_ms: artificialDelay,
      in_normal_period: inNormalPeriod
    });

  } catch (error) {
    recordError();
    const responseTime = Date.now() - requestStart;
    logJson({
      type: 'unexpected_error',
      requestId,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      timestamp: new Date().toISOString(),
      requestId: requestId,
      error: error.message,
      error_type: 'unexpected_error',
      response_time_ms: responseTime
    });
  }
});