
# BorrowBase — Lab 5 Deployment Contract

## 1. Project Information

Project: Inventory and Borrowing System (BorrowBase)

Repository:
https://github.com/thu734/Inventory-and-Borrowing-System

Integration branch: sprint1-staging
Release branch: main

Verified main baseline: ffd1ab5
Verified staging baseline: ca88aa8

## 2. Team Responsibilities

Member 2 (M2):
- Production application setup
- Docker configuration
- GitHub Actions CI
- Automatic deployment workflow
- Application testing
- Final documentation

Member 6 (M6):
- GCP account and billing
- Cloud provisioning scripts
- Cloud SQL and Secret Manager
- First deployment
- IAM and Workload Identity Federation
- GitHub branch protection

Both members review each other's work.

## 3. Deployment Architecture

Frontend: React + TypeScript + Vite
Backend: Node.js + Express + TypeScript
Database: PostgreSQL + Prisma

Hosting: Google Cloud Run
Database hosting: Google Cloud SQL
Secrets: Google Cloud Secret Manager
CI/CD: GitHub Actions

Architecture: Single-container UI/API

## 4. Cloud Configuration

GCP Project ID: cpe334-borrowbase
Region: asia-southeast1 (proposed)

Cloud Run service: borrowbase (proposed)
Cloud SQL instance: borrowbase-pg (proposed)
Database name: borrowbase (proposed)

## 5. Application Configuration

Port: 3000 (proposed)
Host: 0.0.0.0

Production start:
node backend/dist/server.js

API base path: /api/v1
Health endpoint: /api/health
Readiness endpoint: /api/ready

Required runtime variables:
- NODE_ENV
- PORT
- APP_ORIGIN
- DATABASE_URL
- CSRF_SECRET
- RELEASE_SHA

## 6. Deployment Rules

- All feature changes require Pull Requests.
- CI must pass before merge.
- Teammate approval is required.
- Accepted releases merge into main.
- Only accepted main releases deploy.
- Database migrations run before service updates.
- Production secrets must not be committed.
- Routine deployments must not rerun database seed.
- Image releases use commit SHA and immutable digest.

## 7. Pending Confirmation

- GCP region and quota
- Billing and budget alerts
- Cloud resource names
- Application production runtime verification
- Docker image configuration
- Actual Cloud Run public URL
- Cloud SQL connectivity
- Required GitHub CI checks

## 8. Approval

Prepared by: Member 2
Reviewed by: Member 6

Status: Proposed — pending teammate review
