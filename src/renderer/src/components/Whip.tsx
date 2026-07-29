import React, { useEffect, useRef } from 'react'

import { useSettings } from '../SettingsContext'
import A from '../assets/sounds/A.mp3'
import B from '../assets/sounds/B.mp3'
import C from '../assets/sounds/C.mp3'
import D from '../assets/sounds/D.mp3'
import E from '../assets/sounds/E.mp3'

interface WhipProps {
  active: boolean
  onToggle: () => void
}

interface Point {
  x: number
  y: number
  px: number
  py: number
}

const P = {
  segments: 28,
  segmentLength: 12.5,
  taper: 0.6,

  gravity: 1.2,
  dropGravity: 0.95,
  damping: 0.96,
  constraintIters: 14,
  fallingConstraintIters: 5,
  maxStretchRatio: 1.2,
  maxFallingWhips: 4,
  spawnCooldownMs: 150,

  baseTargetAngle: -1.12,
  handleAimByMouseX: 0.4,
  handleAimByMouseY: 0.2,
  handleAimClamp: 2.0,
  handleSpring: 0.7,
  handleAngularDamping: 0.078,
  basePoseSegments: 2,
  basePoseStiffStart: 0.9,
  basePoseStiffEnd: 0.8,

  handleMaxBendDeg: 16,
  tipMaxBendDeg: 130,
  bendRigidityStart: 0.8,
  bendRigidityEnd: 0.12,

  wallBounce: 0.42,
  wallFriction: 0.86,

  crackAccel: 100,
  crackMinSpeed: 30,
  crackMaxSpeed: 400,
  crackCooldownMs: 150,
  firstCrackGraceMs: 350,
  crackAccelWindow: 8,
  crackSpikeFactor: 2.5,
  crackResetRatio: 0.35,

  lineWidthHandle: 3.5,
  lineWidthTip: 2.5,
  outlineWidth: 1.5,
  handleExtraWidth: 2.5,
  handleThickSegments: 2,

  arcWidth: 130,
  arcHeight: 92.5
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

const wrapPi = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function segLen(i: number): number {
  const t = i / (P.segments - 1)
  return P.segmentLength * (1 - t * (1 - P.taper))
}

function catmullPoint(pts: Point[], i: number): Point {
  const n = pts.length
  if (n === 0) return { x: 0, y: 0, px: 0, py: 0 }
  if (i < 0) {
    if (n >= 2) return { x: 2 * pts[0].x - pts[1].x, y: 2 * pts[0].y - pts[1].y, px: 0, py: 0 }
    return { x: pts[0].x, y: pts[0].y, px: 0, py: 0 }
  }
  if (i >= n) {
    if (n >= 2) {
      const a = pts[n - 2]
      const b = pts[n - 1]
      return { x: 2 * b.x - a.x, y: 2 * b.y - a.y, px: 0, py: 0 }
    }
    return { x: pts[n - 1].x, y: pts[n - 1].y, px: 0, py: 0 }
  }
  return pts[i]
}

function whipSegmentBezier(
  pts: Point[],
  i: number
): { cp1x: number; cp1y: number; cp2x: number; cp2y: number; x2: number; y2: number } {
  const p0 = catmullPoint(pts, i - 1)
  const p1 = pts[i]
  const p2 = pts[i + 1]
  const p3 = catmullPoint(pts, i + 2)
  return {
    cp1x: p1.x + (p2.x - p0.x) / 6,
    cp1y: p1.y + (p2.y - p0.y) / 6,
    cp2x: p2.x - (p3.x - p1.x) / 6,
    cp2y: p2.y - (p3.y - p1.y) / 6,
    x2: p2.x,
    y2: p2.y
  }
}

function spawnWhip(mx: number, my: number): Point[] {
  const pts: Point[] = []
  for (let i = 0; i < P.segments; i++) {
    const t = i / (P.segments - 1)
    const x = mx + t * P.arcWidth
    const y = my - Math.sin(t * Math.PI * 0.75) * P.arcHeight
    pts.push({ x, y, px: x, py: y })
  }
  return pts
}

const CRACK_SOUNDS = [A, B, C, D, E]

const activeSounds: HTMLAudioElement[] = []

function playCrackSound(volume: number, pitch: number): void {
  const src = CRACK_SOUNDS[Math.floor(Math.random() * CRACK_SOUNDS.length)]
  const a = new Audio(src)
  a.volume = clamp(volume, 0, 1)
  a.playbackRate = pitch
  activeSounds.push(a)
  a.play().catch((e) => console.error('Whip sound playback failed:', e, 'Source:', src))
  a.onended = () => {
    const idx = activeSounds.indexOf(a)
    if (idx !== -1) activeSounds.splice(idx, 1)
  }
}

export default function Whip({ active, onToggle }: WhipProps): React.JSX.Element | null {
  const { settings } = useSettings()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const volumeRef = useRef(settings.whipVolume / 100)

  useEffect(() => {
    volumeRef.current = settings.whipVolume / 100
  }, [settings.whipVolume])

  useEffect(() => {
    if (!active) return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0
    let H = 0

    const resize = (): void => {
      const dpr = window.devicePixelRatio || 1
      W = window.innerWidth
      H = window.innerHeight
      canvas.width = W * dpr
      canvas.height = H * dpr
      canvas.style.width = `${W}px`
      canvas.style.height = `${H}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    document.body.style.cursor = 'none'

    let mouseX = W / 2
    let mouseY = H / 2
    let prevMouseX = mouseX
    let prevMouseY = mouseY
    let whip: Point[] | null = spawnWhip(mouseX, mouseY)
    let dropping = false
    let lastCrackTime = 0
    let whipSpawnTime = Date.now()
    let prevTipVx = 0
    let prevTipVy = 0
    const accelHistory: number[] = []
    let crackArmed = true
    let handleAngle = P.baseTargetAngle
    let handleAngVel = 0
    const fallingWhips: Point[][] = []
    let togglePending = false
    let lastSpawnTime = 0

    let strokeColor = '#cdd6f4'
    let outlineColor = '#cdd6f4'
    const updateColors = (): void => {
      const text = getComputedStyle(document.documentElement).getPropertyValue('--ctp-text').trim()
      if (text) {
        strokeColor = text
        outlineColor = text
      }
    }
    updateColors()

    const observer = new MutationObserver(updateColors)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme']
    })

    const handleMouseMove = (e: MouseEvent): void => {
      mouseX = e.clientX
      mouseY = e.clientY
    }
    const handleMouseDown = (): void => {
      if (whip && !dropping) {
        dropping = true
        document.body.classList.add('whip-dropping')
        document.body.style.cursor = 'default'
      }
    }
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
        e.preventDefault()
        e.stopImmediatePropagation()
        const now = Date.now()
        if (whip && dropping) {
          if (now - lastSpawnTime < P.spawnCooldownMs) return
          lastSpawnTime = now
          if (fallingWhips.length >= P.maxFallingWhips) {
            fallingWhips.shift()
          }
          fallingWhips.push(whip)
          whip = spawnWhip(mouseX, mouseY)
          dropping = false
          document.body.classList.remove('whip-dropping')
          whipSpawnTime = now
          lastCrackTime = 0
          accelHistory.length = 0
          crackArmed = true
          document.body.style.cursor = 'none'
        } else if (whip && !dropping) {
          dropping = true
          document.body.classList.add('whip-dropping')
          document.body.style.cursor = 'default'
        }
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown, true)

    const updateHandleAim = (): void => {
      if (dropping) return
      const mvx = mouseX - prevMouseX
      const mvy = mouseY - prevMouseY
      const delta = clamp(
        mvx * P.handleAimByMouseX + mvy * P.handleAimByMouseY,
        -P.handleAimClamp,
        P.handleAimClamp
      )
      const target = P.baseTargetAngle + delta
      const err = wrapPi(target - handleAngle)
      handleAngVel += err * P.handleSpring
      handleAngVel *= P.handleAngularDamping
      handleAngle = wrapPi(handleAngle + handleAngVel)
    }

    const applyBasePose = (): void => {
      if (!whip || dropping) return
      const dx = Math.cos(handleAngle)
      const dy = Math.sin(handleAngle)
      const guided = Math.min(P.basePoseSegments, whip.length - 1)
      for (let i = 1; i <= guided; i++) {
        const t = (i - 1) / Math.max(guided - 1, 1)
        const stiff = lerp(P.basePoseStiffStart, P.basePoseStiffEnd, t)
        const prev = whip[i - 1]
        const p = whip[i]
        const targetLen = segLen(i - 1)
        const tx = prev.x + dx * targetLen
        const ty = prev.y + dy * targetLen
        p.x = lerp(p.x, tx, stiff)
        p.y = lerp(p.y, ty, stiff)
      }
    }

    const applyBendLimits = (): void => {
      if (!whip || whip.length < 3) return
      for (let i = 1; i < whip.length - 1; i++) {
        const a = whip[i - 1]
        const b = whip[i]
        const c = whip[i + 1]

        const v1x = a.x - b.x
        const v1y = a.y - b.y
        const v2x = c.x - b.x
        const v2y = c.y - b.y
        const l1 = Math.hypot(v1x, v1y) || 0.0001
        const l2 = Math.hypot(v2x, v2y) || 0.0001
        const n1x = v1x / l1
        const n1y = v1y / l1
        const n2x = v2x / l2
        const n2y = v2y / l2

        const dot = clamp(n1x * n2x + n1y * n2y, -1, 1)
        const angle = Math.acos(dot)
        const t = i / (whip.length - 2)
        const maxBend = (lerp(P.handleMaxBendDeg, P.tipMaxBendDeg, t) * Math.PI) / 180
        const bend = Math.PI - angle
        if (bend <= maxBend) continue

        const cross = n1x * n2y - n1y * n2x
        const sign = cross >= 0 ? 1 : -1
        const targetAngle = Math.PI - maxBend
        const targetA = Math.atan2(n1y, n1x) + sign * targetAngle
        const tx = b.x + Math.cos(targetA) * l2
        const ty = b.y + Math.sin(targetA) * l2
        const rigidity = lerp(P.bendRigidityStart, P.bendRigidityEnd, t)

        c.x = lerp(c.x, tx, rigidity)
        c.y = lerp(c.y, ty, rigidity)
      }
    }

    const capSegmentStretch = (): void => {
      if (!whip || whip.length < 2) return
      for (let i = 0; i < whip.length - 1; i++) {
        const a = whip[i]
        const b = whip[i + 1]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 0.0001
        const maxLen = segLen(i) * P.maxStretchRatio
        if (dist <= maxLen) continue
        const k = maxLen / dist
        b.x = a.x + dx * k
        b.y = a.y + dy * k
      }
    }

    const applyWallCollisions = (): void => {
      if (!whip || dropping) return
      for (let i = 1; i < whip.length; i++) {
        const p = whip[i]
        let vx = p.x - p.px
        let vy = p.y - p.py
        let hit = false

        if (p.x < 0) {
          p.x = 0
          if (vx < 0) vx = -vx * P.wallBounce
          vy *= P.wallFriction
          hit = true
        } else if (p.x > W) {
          p.x = W
          if (vx > 0) vx = -vx * P.wallBounce
          vy *= P.wallFriction
          hit = true
        }

        if (p.y < 0) {
          p.y = 0
          if (vy < 0) vy = -vy * P.wallBounce
          vx *= P.wallFriction
          hit = true
        } else if (p.y > H) {
          p.y = H
          if (vy > 0) vy = -vy * P.wallBounce
          vx *= P.wallFriction
          hit = true
        }

        if (hit) {
          p.px = p.x - vx
          p.py = p.y - vy
        }
      }
    }

    const updateFallingWhip = (pts: Point[]): boolean => {
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]
        const vx = (p.x - p.px) * P.damping
        const vy = (p.y - p.py) * P.damping
        p.px = p.x
        p.py = p.y
        p.x += vx
        p.y += vy + P.dropGravity
      }

      for (let iter = 0; iter < P.fallingConstraintIters; iter++) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i]
          const b = pts[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001
          const target = segLen(i)
          const diff = ((dist - target) / dist) * 0.5
          a.x += dx * diff
          a.y += dy * diff
          b.x -= dx * diff
          b.y -= dy * diff
        }
      }

      return pts.every((p) => p.y > H + 60)
    }

    const update = (): void => {
      for (let i = fallingWhips.length - 1; i >= 0; i--) {
        if (updateFallingWhip(fallingWhips[i])) {
          fallingWhips.splice(i, 1)
        }
      }

      if (!whip) {
        if (togglePending && fallingWhips.length === 0) {
          togglePending = false
          onToggle()
        }
        return
      }

      const g = dropping ? P.dropGravity : P.gravity
      updateHandleAim()

      const start = dropping ? 0 : 1
      for (let i = start; i < whip.length; i++) {
        const p = whip[i]
        const vx = (p.x - p.px) * P.damping
        const vy = (p.y - p.py) * P.damping
        p.px = p.x
        p.py = p.y
        p.x += vx
        p.y += vy + g
      }

      if (!dropping) {
        whip[0].x = mouseX
        whip[0].y = mouseY
        whip[0].px = mouseX
        whip[0].py = mouseY
      }

      capSegmentStretch()
      applyWallCollisions()
      applyBasePose()

      for (let iter = 0; iter < P.constraintIters; iter++) {
        for (let i = 0; i < whip.length - 1; i++) {
          const a = whip[i]
          const b = whip[i + 1]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001
          const target = segLen(i)
          const diff = ((dist - target) / dist) * 0.5
          const ox = dx * diff
          const oy = dy * diff
          if (i === 0 && !dropping) {
            b.x -= ox * 2
            b.y -= oy * 2
          } else {
            a.x += ox
            a.y += oy
            b.x -= ox
            b.y -= oy
          }
        }
        if (iter % 2 === 0) applyBendLimits()
        if (!dropping) applyBasePose()
        capSegmentStretch()
        applyWallCollisions()
      }

      const tip = whip[whip.length - 1]
      const tipVx = tip.x - tip.px
      const tipVy = tip.y - tip.py
      const tipVel = Math.hypot(tipVx, tipVy)
      const tipAccel = Math.hypot(tipVx - prevTipVx, tipVy - prevTipVy)

      // Crack detection uses an adaptive baseline + Schmitt trigger.
      // A rolling average of recent tip acceleration filters frame-to-frame
      // noise and establishes a baseline; a real crack produces a sharp
      // transient that exceeds that baseline by a configurable spike factor.
      // Sustained centripetal acceleration from circular motion stays close to
      // the baseline and is rejected. After firing, the detector disarms until
      // acceleration falls back below a fraction of the threshold, preventing
      // the same high-acceleration period from retriggering.
      const baseline =
        accelHistory.length > 0 ? accelHistory.reduce((a, b) => a + b, 0) / accelHistory.length : 0

      accelHistory.push(tipAccel)
      if (accelHistory.length > P.crackAccelWindow) accelHistory.shift()

      if (!crackArmed && tipAccel < P.crackAccel * P.crackResetRatio) {
        crackArmed = true
      }

      if (
        !dropping &&
        crackArmed &&
        tipVel > P.crackMinSpeed &&
        tipAccel > P.crackAccel &&
        tipAccel > baseline * P.crackSpikeFactor
      ) {
        crackArmed = false
        const now = Date.now()
        if (now - whipSpawnTime >= P.firstCrackGraceMs && now - lastCrackTime > P.crackCooldownMs) {
          lastCrackTime = now
          const intensity = clamp(
            (tipVel - P.crackMinSpeed) / (P.crackMaxSpeed - P.crackMinSpeed),
            0,
            1
          )
          playCrackSound(volumeRef.current * (0.6 + intensity * 0.4), 0.9 + intensity * 0.5)
        }
      }

      prevTipVx = tipVx
      prevTipVy = tipVy

      if (dropping && whip.every((p) => p.y > H + 60)) {
        whip = null
        dropping = false
        document.body.classList.remove('whip-dropping')
        if (fallingWhips.length === 0) {
          onToggle()
        } else {
          togglePending = true
        }
      }

      prevMouseX = mouseX
      prevMouseY = mouseY
    }

    const drawWhipPath = (pts: Point[], simple: boolean): void => {
      if (pts.length < 2) return

      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (simple) {
        ctx.strokeStyle = strokeColor
        ctx.globalAlpha = 0.7
        ctx.lineWidth = P.lineWidthTip
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 0; i < pts.length - 1; i++) {
          const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i)
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
        }
        ctx.stroke()
        ctx.globalAlpha = 1
        return
      }

      // Outline pass
      ctx.strokeStyle = outlineColor
      ctx.globalAlpha = 0.3
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 0; i < pts.length - 1; i++) {
        const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
      }
      ctx.lineWidth = P.lineWidthTip + P.outlineWidth * 2
      ctx.stroke()

      const thickLinks = Math.min(P.handleThickSegments, pts.length - 1)
      if (thickLinks > 0 && P.handleExtraWidth > 0) {
        ctx.beginPath()
        ctx.moveTo(pts[0].x, pts[0].y)
        for (let i = 0; i < thickLinks; i++) {
          const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i)
          ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
        }
        ctx.lineWidth = P.lineWidthHandle + P.handleExtraWidth + P.outlineWidth * 2
        ctx.stroke()
      }
      ctx.globalAlpha = 1

      // Core pass
      ctx.strokeStyle = strokeColor
      for (let i = 0; i < pts.length - 1; i++) {
        const t = i / Math.max(1, pts.length - 2)
        const extra = i < P.handleThickSegments ? P.handleExtraWidth : 0
        ctx.lineWidth = lerp(P.lineWidthHandle, P.lineWidthTip, t) + extra
        const { cp1x, cp1y, cp2x, cp2y, x2, y2 } = whipSegmentBezier(pts, i)
        ctx.beginPath()
        ctx.moveTo(pts[i].x, pts[i].y)
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2)
        ctx.stroke()
      }
    }

    const draw = (): void => {
      ctx.clearRect(0, 0, W, H)
      for (const fw of fallingWhips) {
        drawWhipPath(fw, true)
      }
      if (whip) {
        drawWhipPath(whip, false)
      }
    }

    const tick = (): void => {
      update()
      draw()
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafRef.current)
      observer.disconnect()
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('resize', resize)
      document.body.style.cursor = ''
      document.body.classList.remove('whip-dropping')
    }
  }, [active, onToggle])

  if (!active) return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 99999
      }}
    />
  )
}
