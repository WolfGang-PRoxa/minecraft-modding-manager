# Devenir publieur

Le rôle de publieur donne accès au Studio, qui publie des modpacks sur un dépôt GitHub. Cette page explique ce qu’il
faut, comment passer en publieur et comment connecter le compte GitHub.

## Ce qu’il faut

- **Un compte GitHub** ([création gratuite](https://github.com/signup)).
- **Un dépôt GitHub public** pour les modpacks : c’est là que le Studio crée une release par version, et que
  l’application des joueurs les lit. Un dépôt vide suffit, à créer sur [github.com/new](https://github.com/new) en
  choisissant **Public**.
- **Le droit de publier sur ce dépôt** : en être le propriétaire, ou un collaborateur avec l’accès en écriture.

> [!IMPORTANT]
> Le dépôt doit être **public** : sinon, l’application des joueurs ne peut pas le lire et n’affiche aucun modpack.
> L’application prévient si le dépôt choisi est privé ; sur GitHub, sa visibilité se change dans
> **Settings → General → Danger Zone → Change visibility**.

## Passer en publieur

Au premier lancement, choisir la carte **Publieur** ; plus tard, ouvrir **Paramètres → Utilisation** et cliquer sur
l’onglet **Publieur**. Le formulaire demande deux choses :

1. **Dépôt GitHub des modpacks** : sous la forme `propriétaire/dépôt`, ou en collant son adresse `github.com`.
   L’avatar du propriétaire s’affiche quand le nom est reconnu.
2. **Compte GitHub** : le compte qui a le droit de publier sur ce dépôt (voir ci-dessous).

**Devenir publieur** vérifie ensuite sur GitHub que le dépôt existe et que le compte peut y publier : c’est ce qui
atteste que le dépôt appartient bien au publieur. L’application affiche alors le **Studio**.

En haut de la fenêtre, les onglets **Bibliothèque** et **Studio** permettent maintenant de passer de l’un à l’autre ;
l’application rouvre la dernière vue utilisée.

## Connecter le compte GitHub

L’application utilise la première connexion qu’elle trouve, dans cet ordre :

1. **la connexion faite dans l’application** (un jeton, chiffré par Windows) ;
2. **la variable d’environnement `GITHUB_TOKEN`**, si elle est définie ;
3. **la session [GitHub CLI](https://cli.github.com/)** de ce PC, ouverte avec `gh auth login`.

Si une session existe déjà sur le PC, elle est utilisée d’office : la section **Compte GitHub** affiche le compte et
l’origine de la connexion (« Connecté via la session GitHub CLI de ce PC »). **Utiliser un autre compte** permet d’en
connecter un autre.

### Créer un jeton GitHub

Sans session existante, la connexion se fait avec un jeton d’accès *fine-grained*, limité au dépôt des modpacks :

1. Ouvrir la page de [création d’un jeton](https://github.com/settings/personal-access-tokens/new) (lien
   **en créer un** dans l’application).
2. Lui donner un nom (« Modpack Manager ») et une date d’expiration.
3. Dans **Repository access**, choisir **Only select repositories**, puis le dépôt des modpacks.
4. Dans **Permissions → Repository permissions**, régler **Contents** sur **Read and write**.
5. Cliquer sur **Generate token** et copier le jeton (il commence par `github_pat_`).
6. Dans l’application, le coller dans le champ **Coller un jeton GitHub**, puis cliquer sur **Se connecter**.

Le jeton est chiffré par Windows (DPAPI) : seule la session Windows en cours peut le relire. Il n’est envoyé qu’à
GitHub. **Se déconnecter** le supprime du PC.

> [!TIP]
> Quand l’application propose le bouton **Se connecter avec GitHub**, il évite de créer un jeton : l’application
> affiche un code, ouvre la page GitHub où le saisir, et la connexion se fait dès qu’il est validé.

Quand le jeton expire, l’application l’indique (« GitHub refuse la connexion enregistrée (jeton expiré ou révoqué) :
reconnecte-toi. ») : il suffit d’en créer un nouveau et de le coller à la place.

> [!NOTE]
> Le même compte sert à [signaler un problème](signalement.md) : un jeton limité au dépôt des modpacks ne peut pas
> créer d’issue sur le dépôt de l’application. Le signalement s’ouvre alors dans le navigateur, déjà rempli.

## Les joueurs

Les récepteurs suivent par défaut le dépôt `WolfGang-PRoxa/minecraft-modpack-manager`. Pour une publication sur un
autre dépôt, les joueurs doivent connaître son nom : ils le choisissent dans **Paramètres → Utilisation → Modpacks
de** (voir [Suivre les modpacks d’un autre publieur](bibliotheque.md#suivre-les-modpacks-dun-autre-publieur)).

Après chaque publication, ils voient les nouveautés en actualisant leur application, ou d’eux-mêmes dans les
30 minutes si elle reste ouverte.

## Changer de dépôt ou revenir en récepteur

- **Changer de dépôt** : **Paramètres → Utilisation → Changer**, à la ligne du dépôt. Le compte connecté doit pouvoir
  publier sur le nouveau dépôt. Le Studio relit alors GitHub : il compare le dossier des modpacks au nouveau dépôt.
- **Revenir en récepteur** : l’onglet **Récepteur** de la même section. L’onglet Studio disparaît ; le dossier des
  modpacks, la connexion GitHub et les releases ne sont pas touchés.

La suite : [Le Studio](studio.md).
