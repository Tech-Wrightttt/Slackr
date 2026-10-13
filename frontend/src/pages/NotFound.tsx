import React from 'react';
import { useLocation } from 'react-router-dom';
import { FallbackScreen } from '../components/FallbackScreen';

export const NotFound: React.FC = () => {
  const { pathname } = useLocation();
  return (
    <FallbackScreen
      pose="error"
      code="404"
      title="This page wandered off"
      message={`Nothing lives at ${pathname}. The link may be old or mistyped. Your progress is safe on this device.`}
      actions={[
        { label: 'Back to dashboard', icon: 'home', href: '/', primary: true },
        { label: 'Go back', icon: 'arrow_back', onClick: () => window.history.back() },
      ]}
    />
  );
};
