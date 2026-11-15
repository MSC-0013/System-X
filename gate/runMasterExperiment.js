/** Legacy entry point delegates to the measured, fail-closed experiment runner. */
import { runRealDemo } from './runRealDemo.js';
runRealDemo().catch((error) => { console.error('Experiment failed:', error); process.exitCode = 1; });
