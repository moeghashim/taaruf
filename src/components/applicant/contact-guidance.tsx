/** Copy only: callers must retain their existing authorized contact-release gate. */
export function ContactGuidance({ viewerGender }: { viewerGender?: string }) {
  if (viewerGender === "male") return <>
    <p><strong>Bismillah — reach out today!</strong></p>
    <p>The sister’s contact details are below. Make your intention, reach out with a respectful introduction, and may Allah put khayr in it.</p>
  </>;
  if (viewerGender === "female") return <p>The brother’s contact details are below. Please expect him to reach out to you with a respectful introduction. May Allah put khayr in it.</p>;
  return null;
}
