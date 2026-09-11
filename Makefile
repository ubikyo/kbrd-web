TARGET := kbrd

REMOTE_DIR := /var/www
# Both on the device's own data partition — see KBRD-API's `Config`,
# which reads media and fonts from exactly these.
REMOTE_FONTS := /data/fonts
REMOTE_MEDIA := /data/media

.PHONY: build deploy

build:
	@printf "\033[47;30m %-60s \033[0m\n" " KBRD-WEB : compilation "
	./scripts/build.sh

deploy: build
	@printf "\033[47;30m %-60s \033[0m\n" " KBRD-WEB : déploiement "
	ssh $(TARGET) "mkdir -p $(REMOTE_DIR)"

	rsync -rv --delete \
		dist/ \
		$(TARGET):$(REMOTE_DIR)/

	@printf "\033[47;30m %-60s \033[0m\n" " KBRD-WEB : déploiement des polices "
	ssh $(TARGET) "mkdir -p $(REMOTE_FONTS)"

	# No `--delete` here, unlike the build above: `/data/fonts` is also
	# where KBRD-API stores the fonts a user uploads (see its own
	# `font_dir`), and this would wipe them. Dropping a font from the repo
	# therefore doesn't remove it from the device — that has to be done by
	# hand.
	rsync -rv \
		data/fonts/ \
		$(TARGET):$(REMOTE_FONTS)/

	@printf "\033[47;30m %-60s \033[0m\n" " KBRD-WEB : dossier des médias "
	# Created, never filled: `/data/media` holds what has been uploaded to
	# the device and nothing this repo knows about. `data/media` here is
	# its local counterpart, and is git-ignored for the same reason.
	ssh $(TARGET) "mkdir -p $(REMOTE_MEDIA)"
	@mkdir -p data/media

	@printf "\033[47;30m %-60s \033[0m\n" " KBRD-WEB : permissions "
	ssh $(TARGET) \
		"find $(REMOTE_DIR) -type d -exec chmod 755 {} \; && \
		 find $(REMOTE_DIR) -type f -exec chmod 644 {} \;"

	@printf "\033[47;30m %-60s \033[0m\n" " KBRD-WEB : déploiement terminé "curl
