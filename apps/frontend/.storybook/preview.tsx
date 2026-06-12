import type { Preview } from '@storybook/react';
import { withThemeByClassName } from '@storybook/addon-themes';
import '../src/index.css';

// Toggle Claro/Escuro aplica a classe `dark` no <html> (mesmo seletor do app: html.dark).
const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: 'centered',
    options: {
      storySort: {
        order: ['Design System', ['Visão Geral', 'Tokens'], 'Primitivos', 'Feedback', '*'],
      },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { Claro: '', Escuro: 'dark' },
      defaultTheme: 'Claro',
      parentSelector: 'html',
    }),
  ],
};

export default preview;
