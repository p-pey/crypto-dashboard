import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import { AppSignleton } from "./container";

@AppSignleton()
class AxiosService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      timeout: 15000,
    });

    this.initializeRequestInterceptor();
    this.initializeResponseInterceptor();
  }

  private initializeRequestInterceptor() {
    this.client.interceptors.request.use(
      (config) => {
        return config;
      },
      (error) => Promise.reject(error),
    );
  }

  private initializeResponseInterceptor() {
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      (error) => {
        // Handle refresh token / logging / custom errors
        return Promise.reject(error);
      },
    );
  }

  get instance() {
    return this.client;
  }
  get<T>(url: string, config?: AxiosRequestConfig) {
    return this.client.get<T>(url, config);
  }

  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.post<T>(url, data, config);
  }

  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig) {
    return this.client.put<T>(url, data, config);
  }

  delete<T>(url: string, config?: AxiosRequestConfig) {
    return this.client.delete<T>(url, config);
  }
}

export { AxiosService };
