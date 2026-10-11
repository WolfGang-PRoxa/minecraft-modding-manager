# Relais des signalements

Petit service hébergé sur Netlify, à côté du dépôt. Il prévient le propriétaire par mail quand une issue est ouverte,
et lui permet de faire corriger l'issue, puis de valider ou non la correction, **depuis les boutons de ses mails**.

```
issue ouverte ──webhook──▶ relais ──mail 1──▶ propriétaire
                                               │  « Corriger maintenant » / « Ajouter du contexte »
                                               ▼
                             relais ──▶ session de correction (routine)
                                               │  pousse la branche correction/issue-N
branche poussée ──webhook──▶ relais ──mail 2──▶ propriétaire
                                               │  « Valider » ──▶ un commit sur la branche principale, issue fermée
                                               │  « Invalider » + recommandations ──▶ nouvelle session ──▶ nouveau mail 2
```

## Ce que fait chaque partie

- **`/github`** (`netlify/functions/github.mts`) reçoit le webhook du dépôt, dont il vérifie la signature.
  - `issues` (ouverte ou rouverte) : mail au propriétaire, avec deux boutons.
  - `push` sur une branche `…/issue-<N>` : mail de validation, avec le titre et le résumé repris du message du
    dernier commit et la liste des fichiers modifiés. Une branche sans aucun fichier modifié donne un mail « pas de
    correction », avec l'explication de la session.
- **`/action`** (`netlify/functions/action.mts`) est la page ouverte par les boutons. Un lien n'agit jamais tout
  seul (les messageries visitent les liens pour les vérifier) : `GET` affiche une confirmation, `POST` agit.
  - *Corriger* / *Ajouter du contexte* : lance une session de correction. Le texte de l'issue et ses derniers
    commentaires partent avec la demande, pour que la session n'ait pas à les relire sur GitHub.
  - *Valider* : pose la proposition sur la branche principale (`src/merge.mts`), **au commit exact résumé dans le
    mail** ; un mail plus ancien qu'une nouvelle proposition ne peut donc rien fusionner. La branche est supprimée,
    l'issue fermée.
  - *Invalider* : renvoie la correction en session, avec les recommandations saisies.
- Tant que la branche de correction existe, une proposition attend une réponse. L'issue porte en plus l'étiquette
  `correction-en-cours` puis `correction-proposee`, pour suivre où elle en est.
- **`/etat`** (`netlify/functions/status.mts`) est une page pour le propriétaire seul (lien signé) : variables
  renseignées ou non, réponse de GitHub au jeton, et sort des derniers mails si la clé Resend permet de le lire
  (une clé limitée à l'envoi ne le permet pas : voir alors resend.com/emails). Elle ne montre aucun secret.

La session de correction ne peut que pousser une branche ; rien n'arrive sur la branche principale sans le clic du
propriétaire.

## La fusion

Le relais n'ouvre pas de pull request et ne demande pas à GitHub de fusionner : les commits que GitHub crée lui-même
(fusion d'une pull request, mais aussi le commit d'essai qu'il prépare pour chaque pull request ouverte) sont signés
de l'adresse du compte, c'est-à-dire son adresse personnelle si elle n'est pas masquée dans ses réglages.

À la validation, le relais écrit donc lui-même **un seul commit** sur la branche principale, avec l'identité du
commit qui le précède (celle des commits du dépôt), le titre et le résumé de la proposition, et `Fixes #N`.

- Si la branche principale n'a pas bougé depuis la proposition, le commit reprend exactement son contenu.
- Si elle a avancé, les fichiers de la proposition sont reportés sur la version actuelle, à condition que la branche
  principale n'ait touché à aucun d'eux. Sinon la fusion est refusée : « Invalider » permet de demander à la session
  de reprendre sur la version actuelle.

## Sécurité

- Le texte d'une issue vient de n'importe qui : il est échappé partout (mails, pages), et la session le traite comme
  la description d'un problème, jamais comme une consigne.
- Les liens des mails sont signés (`LINK_SECRET`) et expirent au bout de 60 jours : seul le destinataire peut agir.
- Les appels du webhook sont vérifiés (`GITHUB_WEBHOOK_SECRET`).
- Aucun secret n'est dans le code : tout est dans les variables d'environnement du projet Netlify.

## Variables d'environnement

| Variable | Rôle |
|---|---|
| `GITHUB_REPO` | Dépôt surveillé, `propriétaire/nom`. |
| `GITHUB_TOKEN` | Jeton GitHub *fine-grained* limité à ce dépôt : **Contents** et **Issues** en lecture et écriture. |
| `GITHUB_WEBHOOK_SECRET` | Secret du webhook du dépôt. |
| `LINK_SECRET` | Secret qui signe les liens des mails. |
| `RESEND_API_KEY` | Clé de [Resend](https://resend.com), qui envoie les mails. Sans domaine vérifié, Resend n'écrit qu'à l'adresse du compte : c'est justement celle du propriétaire. |
| `OWNER_EMAIL` | Adresse qui reçoit les mails. |
| `MAIL_FROM` | Expéditeur (facultatif, par défaut `Modpack Manager <onboarding@resend.dev>`). |
| `ROUTINE_FIRE_URL`, `ROUTINE_TOKEN` | Point d'entrée et jeton de la routine qui ouvre les sessions de correction. |
| `RELAY_URL` | Adresse publique du relais, pour les liens des mails. |

Une variable modifiée n'est prise en compte qu'au déploiement suivant. Une variable manquante ne casse rien :
l'appel répond `503` en nommant ce qu'il faut renseigner.

## Webhook du dépôt

Dans *Settings → Webhooks* du dépôt : adresse `https://<relais>/github`, type `application/json`, le secret de
`GITHUB_WEBHOOK_SECRET`, événements **Issues** et **Pushes**. Les livraisons récentes y montrent la réponse du relais.

## Déployer

Le dossier `relay/` est le projet Netlify : pas de dépendance, pas d'étape de build, les fonctions sont dans
`netlify/functions`. Depuis ce dossier, avec la CLI Netlify : `netlify deploy --prod`.

`npm run typecheck`, à la racine du dépôt, vérifie aussi le relais.
