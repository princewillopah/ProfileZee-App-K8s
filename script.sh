#!/bin/bash

#!/bin/bash
# echo "☸️  Deploying TaskFlow to Kubernetes"
# echo ""


# kubectl delete pods -n luxe-backend --all
# kubectl delete pods -n luxe-frontend --all

Namespace="profilezee"

if kubectl get ns "$Namespace" &> /dev/null; then
  echo "Deleting Old app in namespace $Namespace... is already exists."
  kubectl delete ns "$Namespace"
else
  echo "Namespace $Namespace does not exist. Skipping deletion."
#   kubectl create namespace "$Namespace"
fi


# echo "Namespace '$Namespace' deleted."
# # Apply the Kubernetes manifests
kubectl create namespace "$Namespace"



Root_DIR="/home/princewillopah/DevOps/🟢Single-App-Directory/⭐ProfileZee-App/ProfileZee-K8s/kubernetes/"
# echo "$Root_DIR/Kubernetes"

echo ""
echo " ================================================================= "
echo "📦 Deploying secrets & configmaps"
echo " ================================================================= "
# kubectl create namespace taskflow --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f $Root_DIR/secrets/ -n $Namespace
kubectl apply -f $Root_DIR/configmaps/ -n $Namespace

echo ""
echo " ================================================================= "
echo "📦 Deploying Infra Services"
echo " ================================================================= "
INFRA="kafka  mysql  postgres-profiles  postgres-users  redis  zookeeper"

for service in $INFRA; do
# Set build context for frontend
  dir="$Root_DIR/infra/$service"

  echo "Deploying $service..."
  kubectl apply -f $dir/ -n $Namespace
  echo ""
done
echo "Waiting 50 seconds for infra services to initialize..."
for i in {50..1}; do
    printf "\r  ⏳ %02d seconds remaining..." $i
    sleep 1
done
echo ""
echo ""
echo " ================================================================= "
echo "📦 Deploying Backend Services"
echo " ================================================================= "
echo ""
SERVICES="auth-service  frontend  notification-service  profile-service  user-services"
# kubectl apply -f $Root_DIR/apps/ -n $Namespace
echo ""

for service in $SERVICES; do
# Set build context for frontend
  dir="$Root_DIR/apps/$service"

  echo "Deploying $service..."
  kubectl apply -f $dir/ -n $Namespace
  echo ""
done


echo ""
echo " ================================================================= "
echo "📦 Deploying DB SEED FOR ADMIN"
echo " ================================================================= "
echo ""
kubectl apply -f $Root_DIR/jobs/ -n $Namespace
echo ""
echo "Waiting 50 seconds for services to initialize..."
for i in {50..1}; do
    printf "\r  ⏳ %02d seconds remaining..." $i
    sleep 1
done
echo ""
echo "📊 Status:"
kubectl get pods -n $Namespace
echo ""
kubectl get services -n $Namespace
echo ""
kubectl get pods -n $Namespace
echo ""
echo ""
kubectl get services -n $Namespace
echo ""
echo ""
echo "🌐 Verify and Access the app:"
echo "   kubectl get pods -n $Namespace"
echo "   kubectl get pods -n $Namespace"
echo "   kubectl port-forward service/frontend 80:80 -n $Namespace"





