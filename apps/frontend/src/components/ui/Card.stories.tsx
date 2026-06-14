import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './Card';
import { Button } from './Button';

const meta = {
  title: 'Primitivos/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Simples: Story = {
  render: () => (
    <Card className="max-w-sm p-5">
      <p className="text-sm text-base-content">Conteúdo do card.</p>
    </Card>
  ),
};

export const Completo: Story = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Plano Pro</CardTitle>
        <CardDescription>Cobrança mensal, cancele quando quiser.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-base-content/70">Tudo do plano básico, mais relatórios avançados e suporte prioritário.</p>
      </CardContent>
      <CardFooter>
        <Button>Assinar</Button>
        <Button variant="ghost">Saiba mais</Button>
      </CardFooter>
    </Card>
  ),
};
