# kbrd-ui

## Thème

Le thème Mantine de l'application et ses variables CSS (`--kbrd-color-body`,
`--kbrd-border-color`, ...) vivent dans `KBRD-PLUGINS` et sont importés ici
depuis `@kbrd/plugins/theme` (voir `src/main.tsx`). Ils y sont plutôt qu'ici
parce que c'est là que vivent les contrôles qui les lisent (`shared/web/ux/`
et `shared/web/blocks/`) : le Storybook de `KBRD-PLUGINS` monte le même thème,
donc une story montre le composant tel que cette application le dessine.

## Installation



# Build
## Dev
./scripts/build.sh

## Prod
    npm run build

## Preview
    npm run preview


## Development

Use this command to run `KBRD-WEB` without a Raspberry :

    ./dev.sh