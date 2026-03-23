import React, { useEffect, useState } from 'react';
import { getDicebearAvatarUrl, getStudentAvatarUrl } from '../utils/avatar';

function StudentAvatar({ student, size = 28, style = {}, className = '' }) {
  const fallback = getDicebearAvatarUrl(student);
  const [src, setSrc] = useState(getStudentAvatarUrl(student));

  useEffect(() => {
    setSrc(getStudentAvatarUrl(student));
  }, [student]);

  return (
    <img
      src={src}
      alt="Avatar"
      className={`student-avatar ${className}`.trim()}
      onError={() => setSrc(fallback)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        border: '1px solid rgba(255,255,255,.4)',
        ...style,
      }}
    />
  );
}

export { StudentAvatar };
