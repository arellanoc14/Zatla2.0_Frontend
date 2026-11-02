import React from "react";
import { StudioProvider } from "@/lib/growroom/StudioStore";
import StudioEditor from "@/components/studio/StudioEditor";
import LocalDesignSaver from "@/components/studio/LocalDesignSaver";
import ShareDesignButton from "@/components/studio/ShareDesignButton";
import CartPill from "@/components/cart/CartPill";
import PageLoader from "@/components/PageLoader";
import { loadOrBlankDoc } from "@/lib/growroom/blankDoc";

// The studio: 3D only, at /design. Opens the design last saved in this browser,
// or a blank 40x30 room (buildBlankDoc, in blankDoc.js) when there isn't one,
// and saves its own edits back the same way.
export default function Design3D() {
  const [doc] = React.useState(loadOrBlankDoc);

  return (
    <StudioProvider key="design-3d" initialDoc={doc}>
      <LocalDesignSaver />
      <main className="relative h-[100dvh] w-full bg-[#151517]">
        {/* The cart and share pills ride in the 3D view's top-right corner (not
            the page's), so they never sit over the docked Results panel. */}
        <StudioEditor
          projectId={null}
          onBack={null}
          isSubscribed={true}
          lockedMode="3d"
          // The same branded loader as the page transition, so the route load and
          // the 3D scene build read as one continuous loading screen.
          loader3d={<PageLoader label="Loading the 3D designer" />}
          actions3d={(
            <>
              <CartPill />
              <ShareDesignButton />
            </>
          )}
        />
      </main>
    </StudioProvider>
  );
}
