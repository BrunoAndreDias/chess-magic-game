import { defineConfig } from 'vite';
import { gameRecords } from './scripts/records-plugin';

export default defineConfig({ plugins: [gameRecords()] });
