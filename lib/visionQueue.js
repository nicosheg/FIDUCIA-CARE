// Simple in‑memory job queue for Groq vision requests
const queue = [];
let processing = false;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  const job = queue.shift();

  try {
    const result = await job.task();
    job.resolve(result);
  } catch (err) {
    // If rate limited, requeue after waiting
    if (err.rateLimit) {
      console.log(`Rate limit hit, retrying job in ${err.waitSec}s`);
      setTimeout(() => {
        // Put the job back at the front
        queue.unshift(job);
        processing = false;
        processQueue();
      }, err.waitSec * 1000);
    } else {
      job.reject(err);
    }
  } finally {
    processing = false;
    // Process next job after a short delay
    setTimeout(processQueue, 200);
  }
}

/**
 * Enqueue a vision task. Returns a promise.
 * @param {Function} task - async function that returns people array
 */
export function enqueueVisionJob(task) {
  return new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    processQueue();
  });
    }
