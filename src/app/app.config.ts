import { InjectionToken } from '@angular/core';

export interface AppConfig {
    apiUrl: string;
}

export const TERSECT_BROWSER_CONFIG: AppConfig = {
    apiUrl: 'http://localhost:8060/tbapi'
};

export const APP_CONFIG = new InjectionToken<AppConfig>('app.config');
