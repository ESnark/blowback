/**
 * Vite HMR update event interface
 */
export interface HMRUpdate {
  type: 'update';
  updates: {
    type: string;
    path: string;
    acceptedPath: string;
    timestamp: number;
  }[];
}

/**
 * Vite HMR error event interface
 */
export interface HMRError {
  type: 'error';
  err: {
    message: string;
    stack: string;
  };
}

/**
 * Vite HMR browser error event interface
 */
export interface HMRBrowserError {
  type: 'browser-error';
  err: {
    message: string;
    stack: string;
  };
}

/**
 * Vite HMR event type (all possible HMR event types)
 */
export type HMREvent = HMRUpdate | HMRError | HMRBrowserError | { type: string; [key: string]: unknown };

/**
 * Network request information interface
 */
export interface NetworkRequest {
  url: string;
  method: string;
  resourceType: string;
  timestamp: number;
}
