---
name: tradease-context
description: Single source of truth for the Tradease shared system. Read this before any task that touches the database, design system, business logic, or cross-platform behavior. Required reading before: any Supabase query, any color/font/spacing decision, any booking or payment logic, any RPC call, any employee permission check.
---

# Tradease Shared Context

Both the Expo app (React Native) and the website (Next.js) share one Supabase
project: linqsojbszglbgpoxgtv (us-east-2). A change to the database or an RPC
affects both platforms instantly. Never assume a migration was or wasn't run —
always verify against the live schema before writing queries.

---

## Design System

These values are identical across both platforms. No exceptions.