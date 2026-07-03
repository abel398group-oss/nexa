import '@testing-library/jest-dom';

// Runs after each test: cleanup renders
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
afterEach(cleanup);
