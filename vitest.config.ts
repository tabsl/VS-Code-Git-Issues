import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts'],
    alias: {
      vscode: path.resolve(__dirname, 'test/unit/__mocks__/vscode.ts'),
    },
  },
});
