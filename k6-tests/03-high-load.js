import http from 'k6/http';
import { sleep } from 'k6';

// High load - 60 VUs, should push backends to 80%+ capacity
// This should trigger degradation and weight adjustments
export let options = {
  stages: [
    { duration: '10s', target: 20 },  
    { duration: '10s', target: 40 },  
    { duration: '10s', target: 60 },  
    { duration: '50s', target: 60 },  // Hold to see Sentinel respond
    { duration: '10s', target: 0 },   
  ],
};

export default function () {
  http.get('http://localhost:8080/api/test');
  sleep(0.1); // Short sleep = high concurrency
}
