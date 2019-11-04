import { InjectionToken } from '@angular/core';

export interface AppConfig {
    tbApiUrl: string;
    tgrcApiUrl: string;
}

export const TERSECT_BROWSER_CONFIG: AppConfig = {
    tbApiUrl: './tbapi',
    tgrcApiUrl: './tgrc'
};

export const APP_CONFIG = new InjectionToken<AppConfig>('app.config');
