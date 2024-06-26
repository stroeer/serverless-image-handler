REGION 					?= eu-west-1
APP_SUFFIX 			?=
MODE 						?= plan
DO_TF_UPGRADE 	?= false
FUNC						?= image-handler

ACCOUNT_ID 			= $(eval ACCOUNT_ID := $(shell aws --output text sts get-caller-identity --query "Account"))$(ACCOUNT_ID)
VERSION 			= $(eval VERSION := $$(shell git rev-parse --short HEAD))$(VERSION)

TF_BACKEND_CFG 		= $(eval TF_BACKEND_CFG := -backend-config=bucket=terraform-state-$(ACCOUNT_ID)-$(REGION) \
							-backend-config=region=$(REGION) \
							-backend-config=key="regional/lambda/$(FUNC)/terraform$(APP_SUFFIX).tfstate")$(TF_BACKEND_CFG)

TF_VARS				= $(eval TF_VARS := -var="region=$(REGION)" -var="account_id=$(ACCOUNT_ID)" -var="app_suffix=$(APP_SUFFIX)")$(TF_VARS)
TF_FOLDERS 			:= $(shell find . -not -path "*/\.*" -iname "*.tf" | sed -E "s|/[^/]+$$||" | sort --unique)

WORK_DIR := source/$(FUNC)

check-func:
ifndef FUNC
	$(error FUNC is undefined)
endif

all :: build tf

.PHONY: clean
clean: check-func
	@echo "+ $@"
	@cd $(WORK_DIR) && rm -rf ./dist/ ./node_modules/

.PHONY: npm/install
npm/install: check-func
	@echo "+ $@"
	cd $(WORK_DIR) && npm install --cpu=arm64 --os=linux --libc=musl

.PHONY: npm/test
npm/test: check-func
	@echo "+ $@"
	cd $(WORK_DIR) && npm run test

.PHONY: build
build: check-func ## Builds the `FUNC`
	@echo "+ $@"
	cd $(WORK_DIR) && if [ -f 'package.json' ] ; then \
		npm run test && npm run build ; \
	elif [ -f 'Cargo.toml' ] ; then \
		cargo lambda build --arm64 --release --output-format zip --lambda-dir target/lambda/arm64 ; \
	else \
		echo 'Unknown FUNC/Build: $(FUNC). Aborting.' ; exit 1 ; \
	fi

tf: check-func ## Runs `terraform` for the `FUNC`
	rm -f $(WORK_DIR)/terraform/.terraform/terraform.tfstate || true
	terraform -chdir=$(WORK_DIR)/terraform init $(TF_VARS) -reconfigure -upgrade=$(DO_TF_UPGRADE) $(TF_BACKEND_CFG)
	if [ "true" == "$(DO_TF_UPGRADE)" ]; then terraform -chdir=$(WORK_DIR)/terraform providers lock -platform=darwin_amd64 -platform=darwin_arm64 -platform=linux_amd64; fi
	terraform -chdir=$(WORK_DIR)/terraform $(MODE) $(TF_VARS)

.PHONY: deploy
deploy: check-func build ## Uploads the `FUNC` to start CodePipeline deployment
	@echo "+ $@"
	if [ "image-handler" = "$(FUNC)" ] ; then \
		aws s3 cp $(WORK_DIR)/dist/image-handler.zip s3://ci-$(ACCOUNT_ID)-$(REGION)/image-handler/image-handler$(APP_SUFFIX).zip ; \
	elif [ "thumbs" = "$(FUNC)" ] ; then \
        aws s3 cp $(WORK_DIR)/target/lambda/arm64/thumbs/bootstrap.zip s3://ci-$(ACCOUNT_ID)-$(REGION)/image-thumbs/image-thumbs$(APP_SUFFIX).zip ; \
	else \
		echo "Unknown FUNC/Deploy: $(FUNC). Aborting." ; exit 1 ; \
	fi

.PHONY: help
help: ## Display this help screen
	@grep -E '^[0-9a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'

.PHONY: providers
providers: update ## Upgrades all providers and platform independent dependency locks (slow)
	@echo "+ $@"
	@for f in $(TF_FOLDERS) ; do \
  		echo upgrading: $$f ;\
		terraform -chdir=$$f init -upgrade=true -backend=false;\
		terraform -chdir=$$f providers lock -platform=darwin_amd64 -platform=darwin_arm64 -platform=linux_amd64 ;\
	done

.PHONY: update
update: ## Upgrades Terraform core, providers and modules constraints recursively using https://github.com/minamijoyo/tfupdate
	@echo "+ $@"
	@command -v tfupdate >/dev/null 2>&1 || { echo >&2 "Please install tfupdate: 'brew install minamijoyo/tfupdate/tfupdate'"; exit 1; }
	@tfupdate terraform -v "~> 1" -r .
	@tfupdate module -v "7.5.0" registry.terraform.io/moritzzimmer/lambda/aws -r .
	@tfupdate module -v "7.5.0" registry.terraform.io/moritzzimmer/lambda/aws//modules/deployment -r .
	@tfupdate provider aws -v "~> 5" -r .
	@tfupdate provider opensearch -v "~> 2" -r .

