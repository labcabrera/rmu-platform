#!/bin/bash

set -e

MINIKUBE_PROFILE="rmu"
MINIKUBE_MEMORY=12288
MINIKUBE_CPUS=4
MINIKUBE_DISK=40g
K8S_VERSION=v1.33.1

NAMESPACE_APPS="apps-local"
NAMESPACE_TOOLS="platform"

echo "----------------------------------------------------------------------------"
echo "✨ Starting minikube..."
echo "----------------------------------------------------------------------------"

minikube start \
  --profile "$MINIKUBE_PROFILE" \
  --driver=docker \
  --memory=$MINIKUBE_MEMORY \
  --cpus=$MINIKUBE_CPUS \
  --disk-size=$MINIKUBE_DISK \
  --kubernetes-version=$K8S_VERSION

minikube addons enable metrics-server --profile "$MINIKUBE_PROFILE"

minikube addons enable ingress --profile "$MINIKUBE_PROFILE"

echo "----------------------------------------------------------------------------"
echo "✨ Creating namespace "$NAMESPACE_APPS" and installing configMaps and secrets..."
echo "----------------------------------------------------------------------------"

kubectl create namespace "$NAMESPACE_APPS"

find ../k8s/configmaps -name "*.yaml" -o -name "*.yml" | while read -r file; do
  kubectl apply -f "$file" -n "$NAMESPACE_APPS"
done

find ../k8s/secrets -name "*.yaml" -o -name "*.yml" | while read -r file; do
  kubectl apply -f "$file" -n "$NAMESPACE_APPS"
done

echo "----------------------------------------------------------------------------"
echo "✨ Installing ArgoCD and configuring applications..."
echo "----------------------------------------------------------------------------"

helm install argocd argo/argo-cd \
  --namespace "$NAMESPACE_TOOLS" \
  --create-namespace \
  --set server.service.type=NodePort \
  --set configs.secret.argocdServerAdminPassword='$2y$10$vAKJfNlItZH/h500v0DObOd5IFBAUJifgSLTiVpKzqJ2AKGhqozVy'

# Create ArgoCD applications

find ../argocd -name "*.yaml" -o -name "*.yml" | while read -r file; do
  kubectl apply -f "$file" -n "$NAMESPACE_TOOLS"
done