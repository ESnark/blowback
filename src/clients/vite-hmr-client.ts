import WebSocket from 'ws';
import { HMREvent } from '../types/hmr.js';

/**
 * Vite HMR WebSocket client class
 * Subscribes to and processes HMR events from Vite development server
 */
export class ViteHMRClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private eventListeners: Map<string, ((data: any) => void)[]> = new Map();
  private connectionPromise: Promise<void> | null = null;
  
  /**
   * @param viteServerUrl Vite HMR WebSocket URL (e.g., ws://localhost:5173/__hmr)
   */
  constructor(private viteServerUrl: string) {}

  /**
   * Connect to Vite HMR server
   * @returns Promise that resolves when connection is complete
   */
  connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.error(`Connecting to Vite HMR server at ${this.viteServerUrl}`);
        this.ws = new WebSocket(this.viteServerUrl);

        this.ws.on('open', () => {
          console.error('Connected to Vite HMR server');
          this.connected = true;
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const eventData = JSON.parse(data.toString()) as HMREvent;
            console.error(`Received HMR event: ${eventData.type}`);
            
            // Call listeners for specific event type
            const listeners = this.eventListeners.get(eventData.type) || [];
            listeners.forEach(listener => listener(eventData));
            
            // Call 'all' event listeners (receive all events)
            const allListeners = this.eventListeners.get('all') || [];
            allListeners.forEach(listener => listener(eventData));
          } catch (err) {
            console.error('Error parsing HMR message:', err);
          }
        });

        this.ws.on('error', (err) => {
          console.error('Vite HMR WebSocket error:', err);
          if (!this.connected) {
            reject(err);
          }
        });

        this.ws.on('close', () => {
          console.error('Vite HMR WebSocket closed');
          this.connected = false;
          this.ws = null;
          this.connectionPromise = null;
        });
      } catch (err) {
        console.error('Error connecting to Vite HMR server:', err);
        this.connectionPromise = null;
        reject(err);
      }
    });

    return this.connectionPromise;
  }

  /**
   * Register a listener for a specific event type
   * @param event Event type ('update', 'error', etc.) or 'all'
   * @param callback Callback function to be called when the event occurs
   */
  on(event: string, callback: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Close connection and clean up resources
   */
  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.connectionPromise = null;
    }
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}
