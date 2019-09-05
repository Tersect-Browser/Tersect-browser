import { InjectionToken } from '@angular/core';

export interface AppConfig {
    tbApiUrl: string;
    tgrcApiUrl: string;
}

export const TERSECT_BROWSER_CONFIG: AppConfig = {
    tbApiUrl: 'http://localhost:8060/tbapi',
    tgrcApiUrl: 'http://localhost:8060/tgrc'
};

export const APP_CONFIG = new InjectionToken<AppConfig>('app.config');
