import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './Tabs';

const meta = {
  title: 'Primitivos/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  args: { children: '' },
} satisfies Meta<typeof Tabs>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Padrao: Story = {
  render: () => (
    <Tabs defaultValue="geral" className="w-96">
      <TabsList>
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="email">E-mail</TabsTrigger>
        <TabsTrigger value="whats">WhatsApp</TabsTrigger>
      </TabsList>
      <TabsContent value="geral">Configurações gerais da campanha.</TabsContent>
      <TabsContent value="email">Assunto, remetente e anti-spam.</TabsContent>
      <TabsContent value="whats">Número, janela de envio e limites.</TabsContent>
    </Tabs>
  ),
};
