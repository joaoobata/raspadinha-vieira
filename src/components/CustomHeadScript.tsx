import * as React from "react";
import { getSettings } from "@/app/admin/settings/actions";

// This is a server component that fetches the custom script from settings
// and injects it into the <head> of the document.
export async function CustomHeadScript() {
  const { success, data } = await getSettings();

  if (!success || !data?.customHeadScript) {
    return null;
  }

  return (
    <React.Fragment
      dangerouslySetInnerHTML={{
        __html: data.customHeadScript,
      }}
    />
  );
}
