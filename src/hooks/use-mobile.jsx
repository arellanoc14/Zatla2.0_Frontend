import * as React from "react"

const MOBILE_BREAKPOINT = 768

function detectMobile() {
  if (typeof window === "undefined") return false
  const narrowViewport = window.innerWidth < MOBILE_BREAKPOINT
  const shortScreen = Math.min(window.screen?.width || Infinity, window.screen?.height || Infinity) < MOBILE_BREAKPOINT
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches || navigator.maxTouchPoints > 1
  const mobileBrowser = navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  return narrowViewport || mobileBrowser || (shortScreen && coarsePointer)
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(detectMobile)

  React.useEffect(() => {
    const update = () => setIsMobile(detectMobile())
    const viewportQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    viewportQuery.addEventListener("change", update)
    window.addEventListener("resize", update)
    window.addEventListener("orientationchange", update)
    update()
    return () => {
      viewportQuery.removeEventListener("change", update)
      window.removeEventListener("resize", update)
      window.removeEventListener("orientationchange", update)
    }
  }, [])

  return isMobile
}