import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { analytics } from '@/lib/analytics';
import { toAppError, userMessage } from '@/lib/errors';
import { freeText } from '@/lib/forms';
import { AlertText, Button, Screen, TextField } from '@/ui';

import { useCreateItem } from './api';

export const NewItemSchema = z.object({
  title: freeText().min(1, 'Enter a title').max(120, 'At most 120 characters'),
  description: freeText()
    .max(2000, 'At most 2000 characters')
    .transform((value) => (value === '' ? undefined : value)),
});

type NewItemValues = z.input<typeof NewItemSchema>;

/**
 * Presented as a sheet (src/app/(app)/_layout.tsx); its route passes
 * `onCreated`, which closes it once the server accepted the item. It is not
 * called when the sheet was closed while the request was on its way: the
 * user has moved on, and navigating then would pull them off the screen they
 * are on.
 */
export function NewItemScreen({ onCreated }: { onCreated?: () => void }) {
  const createItem = useCreateItem();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<NewItemValues, unknown, z.output<typeof NewItemSchema>>({
    resolver: zodResolver(NewItemSchema),
    defaultValues: { title: '', description: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await createItem.mutateAsync(
        {
          title: values.title,
          ...(values.description !== undefined && { description: values.description }),
        },
        // TanStack Query runs the callbacks given to mutate only while this
        // screen is mounted: once the user closed the sheet, nothing moves.
        { onSuccess: onCreated },
      );
      analytics.track('item_created', {});
    } catch (error) {
      const appError = toAppError(error);
      const fields = appError.details.fieldErrors?.filter(
        (field) => field.path === 'title' || field.path === 'description',
      );
      if (appError.kind === 'validation' && fields?.length) {
        for (const field of fields) {
          setError(field.path as 'title' | 'description', { message: field.message });
        }
      } else {
        setFormError(userMessage(appError));
      }
    }
  });

  return (
    <Screen scroll edges={['bottom', 'left', 'right']} testID="new-item-screen">
      <Controller
        control={control}
        name="title"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Title"
            testID="new-item-title"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.title?.message}
            maxLength={120}
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => {
              setFocus('description');
            }}
          />
        )}
      />
      <Controller
        control={control}
        name="description"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label="Description"
            hint="Optional"
            testID="new-item-description"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.description?.message}
            maxLength={2000}
            multiline
          />
        )}
      />
      {formError !== null && <AlertText tone="danger">{formError}</AlertText>}
      <Button
        label="Create"
        testID="new-item-submit"
        loading={isSubmitting}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
