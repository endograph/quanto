// React input for quanto. See DESIGN.md, "The input component".

export { QuantoProvider, useQuantoCtx } from './context';
export { useQuanto } from './use-quanto';
export type { QuantoField, QuantoInputProps, UseQuantoOptions } from './use-quanto';
export { QuantoInput } from './quanto-input';
export type { AccessoryProps, QuantoInputComponentProps } from './quanto-input';
export { useExternalQuanto } from './use-external-quanto';
export type {
  CompletionItem,
  CompletionItemProps,
  CompletionListProps,
  ExternalQuantoCompletions,
  ExternalQuantoField,
  ExternalQuantoInputProps,
  UseExternalQuantoOptions,
} from './use-external-quanto';
export { alternatives, echo, initialState, reduce } from './field';
export type { Commit, Display, Echo, FieldEnv, FieldEvent, FieldState, Transition } from './field';
export { entries, initialExternalState, isOpen, reduceExternal } from './external-field';
export type { Entry, ExternalFieldEnv, ExternalFieldEvent, ExternalFieldState, ExternalTransition } from './external-field';
