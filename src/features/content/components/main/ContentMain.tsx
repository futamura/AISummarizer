import React from 'react';

import { Toaster } from '@/features/content/components/main';

export const ContentMain: React.FC = () => {
  /**
   * Render the component
   */
  return <Toaster position="top-center" duration={2000} />;
};
