'use client'

import dynamic from 'next/dynamic'
import type { Application } from '@splinetool/runtime'

/**
 * Wrapper client-only per le scene Spline.
 * `ssr: false` evita che il runtime WebGL di Spline (che dipende da `window`)
 * venga eseguito sul server, prevenendo errori di idratazione.
 */
const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <span className="loader" aria-label="Caricamento scena 3D" />
    </div>
  ),
})

interface SplineSceneProps {
  scene: string
  className?: string
  onLoad?: (spline: Application) => void
}

export function SplineScene({ scene, className, onLoad }: SplineSceneProps) {
  return <Spline scene={scene} className={className} onLoad={onLoad} />
}
