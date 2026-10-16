'use client';
import type { ComponentProps, ChangeEvent } from 'react';
import { Button as SharedButton, buttonVariants } from '@/components/ui/button';
import { Card as SharedCard } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
export { Input } from '@/components/ui/input';
export { NativeSelect } from '@/components/ui/native-select';

type Variant = 'primary' | 'secondary' | 'ghost';
export const buttonStyles = (variant: Variant = 'primary') => buttonVariants({ variant: variant === 'primary' ? 'default' : variant });
export function Button({ variant = 'primary', type = 'button', ...props }: Omit<ComponentProps<typeof SharedButton>, 'variant'> & { variant?: Variant }) {
  return <SharedButton type={type} variant={variant === 'primary' ? 'default' : variant} {...props} />;
}
export function Card({ className = '', ...props }: ComponentProps<typeof SharedCard>) {
  return <SharedCard className={`p-5 ${className}`} {...props} />;
}
export function Check({ onChange, checked, className, ...props }: Omit<ComponentProps<typeof Checkbox>, 'onCheckedChange' | 'onChange'> & { onChange?: (event: ChangeEvent<HTMLInputElement>) => void }) {
  return <Checkbox {...props} checked={checked} className={className} onCheckedChange={value => onChange?.({ target: { checked: value } } as ChangeEvent<HTMLInputElement>)} />;
}
