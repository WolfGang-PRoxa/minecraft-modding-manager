# Devenir publieur

Le rôle de publieur donne accès au Studio, qui publie tes modpacks sur un dépôt GitHub. Cette page explique ce qu’il
te faut, comment passer en publieur et comment connecter ton compte GitHub.

## Ce qu’il te faut

- **Un compte GitHub** ([création gratuite](https://github.com/signup)).
- **Un dépôt GitHub public** pour tes modpacks : c’est là que le Studio crée une release par version, et que
  l’application de tes joueurs les lit. Un dépôt vide suffit : crée-le sur [github.com/new](https://github.com/new)
  en choisissant **Public**.
- **Le droit de publier sur ce dépôt** : en être le propriétaire, ou un collaborateur avec l’accès en écriture.

> [!IMPORTANT]
> Le dépôt doit être **public** : sinon, l’application de tes joueurs ne peut pas le lire et n’affiche aucun
> modpack. L’application te prévient si le dépôt choisi est privé ; sur GitHub, sa visibilité se change dans
> **Settings → General → Danger Zone → Change visibility**.

## Passer en publieur

Au premier lancement, choisis la carte **Publieur** ; plus tard, ouvre **Paramètres → Utilisation** et clique sur
l’onglet **Publieur**. Le formulaire demande deux choses :

1. **Dépôt GitHub des modpacks** : saisis-le sous la forme `propriétaire/dépôt`, ou colle son adresse `github.com`.
   L’avatar du propriétaire s’affiche quand le nom est reconnu.
2. **Compte GitHub** : connecte le compte qui a le droit de publier sur ce dépôt (voir ci-dessous).

Clique ensuite sur **Devenir publieur**. L’application vérifie sur GitHub que le dépôt existe et que le compte peut
y publier : c’est ce qui atteste qu’il s’agit bien de toi. Puis elle affiche le **Studio**.

En haut de la fenêtre, les onglets **Bibliothèque** et **Studio** permettent maintenant de passer de l’un à l’autre ;
l’application rouvre la dernière vue utilisée.

## Connecter ton compte GitHub

L’application utilise la première connexion qu’elle trouve, dans cet ordre :

1. **la connexion faite dans l’application** (un jeton, chiffré par Windows) ;
2. **la variable d’environnement `GITHUB_TOKEN`**, si elle est définie ;
3. **la session [GitHub CLI](https://cli.github.com/)** de ce PC, si tu t’y es connecté avec `gh auth login`.

Si une session existe déjà sur le PC, elle est utilisée d’office : la section **Compte GitHub** affiche le compte et
l’origine de la connexion (« Connecté via la session GitHub CLI de ce PC »). **Utiliser un autre compte** permet d’en
connecter un autre.

### Créer un jeton GitHub

Sans session existante, connecte-toi avec un jeton d’accès *fine-grained*, limité à ton dépôt :

1. Ouvre la page de [création d’un jeton](https://github.com/settings/personal-access-tokens/new) (lien
   **en créer un** dans l’application).
2. Donne-lui un nom (« Modpack Manager ») et une date d’expiration.
3. Dans **Repository access**, choisis **Only select repositories**, puis ton dépôt de modpacks.
4. Dans **Permissions → Repository permissions**, règle **Contents** sur **Read and write**.
5. Clique sur **Generate token** et copie le jeton (il commence par `github_pat_`).
6. Dans l’application, colle-le dans le champ **Coller un jeton GitHub**, puis clique sur **Se connecter**.

Le jeton est chiffré par Windows (DPAPI) : seule ta session Windows peut le relire. Il n’est envoyé qu’à GitHub.
**Se déconnecter** le supprime du PC.

> [!TIP]
> Quand l’application propose le bouton **Se connecter avec GitHub**, il évite de créer un jeton : l’application
> affiche un code, ouvre la page GitHub où le saisir, et la connexion se fait dès que tu l’as validée.

Quand le jeton expire, l’application l’indique (« GitHub refuse la connexion enregistrée (jeton expiré ou révoqué) :
reconnecte-toi. ») : crée-en un nouveau et colle-le à la place.

> [!NOTE]
> Le même compte sert à [signaler un problème](signalement.md) : un jeton limité à ton dépôt ne peut pas créer
> d’issue sur le dépôt de l’application. Le signalement s’ouvre alors dans ton navigateur, déjà rempli.

## Tes joueurs

Les récepteurs suivent par défaut le dépôt `WolfGang-PRoxa/minecraft-modpack-downloader`. Si tu publies sur un autre
dépôt, donne son nom à tes joueurs : ils le choisissent dans **Paramètres → Utilisation → Modpacks de** (voir
[Suivre les modpacks d’un autre publieur](bibliotheque.md#suivre-les-modpacks-dun-autre-publieur)).

Après chaque publication, ils voient les nouveautés en actualisant leur application, ou d’eux-mêmes dans les
30 minutes si elle reste ouverte.

## Changer de dépôt ou revenir en récepteur

- **Changer de dépôt** : **Paramètres → Utilisation → Changer**, à la ligne du dépôt. Le compte connecté doit pouvoir
  publier sur le nouveau dépôt. Le Studio relit alors GitHub : il compare ton dossier au nouveau dépôt.
- **Revenir en récepteur** : l’onglet **Récepteur** de la même section. L’onglet Studio disparaît ; ton dossier, ta
  connexion GitHub et tes releases ne sont pas touchés.

La suite : [Le Studio](studio.md).
