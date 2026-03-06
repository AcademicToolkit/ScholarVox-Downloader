# Documentation Utilisateurs
*L'extension étant destinée à des personnes pouvant accéder à une instance ScholarVox Univ qui est un site à destination des étudiants et universtaires français, la documentation utilisateur est rédigées exclusivement en français*

## Objet de l'extension
Il s'agit de sauvegarder pour une utilisation hors-ligne les documents fournis par une instance ScholarVox Univ. En effet, un téléchargement en html de la page du viewer ne fonctionne pas, et il n'est pas possible d'imprimer nativement en PDF, sans etre soumis aux quotas quotidiens. Cette extension permet de le réaliser.
## Captures d'écran et vidéo
Tout le monde aime les captures d'écran, en voici :

![ScreenShot 1](./screenshots/1.png "Écran principal")
![ScreenShot 1](./screenshots/2.png "Historique")
![ScreenShot 1](./screenshots/3.png "Paramètre")
![ScreenShot 1](./screenshots/4.png "Exemple de résultat de recherche avec les deux nouveaux boutons")

Une vidéo montrant le comportement de l'extension pendant la capture où je suis volontairement resté sur l'onglet.

<video width="640" height="360" controls>
<source src="./screenshots/video.mp4" type="video/mp4">
Your browser does not support the video tag
</video>

## Fonctionnalités
- À partir du viewer :
    - Possibilité de télécharger le livre en PDF, HTML ou les deux
    - Spécifier les pages que l'on souhaite obtenir
    - **En raisons de limitations propres à Firefox, il est impossible d'imprimer en pdf silencieusement (= sans interaction avec l'utilisateur), à la fin du processus, il faudra donc valider l'impression en pdf si l'option est choisie.** 
- À partir des pages de présentation d'un livre et des pages de recherche : 
    - Ouvrir dans un nouvel onglet le viewer (et non dans une nouvelle fenêtre)
    - Télécharger directement tout le livre en HTML tout en faisant autre chose pendant ce temps.
- Fonctionnalités générales :
    - Historique des livres téléchargés
    - Paramétrage de la vitesse et du zoom de défilement
    - Paramétrage du nombre maximal de téléchargement à la fois via une file d'attente
## Utilisation de l'extension
### Fonctionnement
L'extension télécharge page par page le livre et capture les requêtes réseaux pour obtenir les ressources liées au livres comme les polices. Cela signifie que l'extension imite le comportement d'un utilisateur qui lirait le livre en entier en une seule fois.
### Conséquences

Avec les paramètres par défaut, l'utilisation de l'extension est sans risque tant que vous ne téléchargez pas plus de 3/4 livres par jour. Au-delà, l'activité de votre compte paraîtrait suspecte (En effet, qui lit plus de 4 livres entiers par jour ?)

Vous pouvez modifier la vitesse et le zoom de défilement pour augmenter la vitesse d'export, mais vous devez faire en sorte que chaque page apparaisse au moins une fois à l'écran. De plus, une vitesse de défilement trop élevée pourrait créer une activité suspecte sur votre compte. 

## Usage et Risque
Cette extension a pour but de télécharger les documents à des fins personnelles uniquement. Elle ne doit en aucun cas servir à télécharger en masse des documents pour les pirater et les publier sur la Z-Lib par exemple. Si vous étiez découverts :
1. Votre compte pourrait être désactivé, car l'usage de cette extension ne respecte pas les CGU
2. l'institution qui vous fournit l'accès pourrait avoir des ennuis et 
3. les accords entre le consortium Couperin et les éditeurs pourraient être revus en faveur des éditeur, ce qui mettrait l'ensemble des institutions en difficultés.