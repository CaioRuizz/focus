// CI/CD no Jenkins (https://jenkins.caioruiz.com): gera o site e publica na branch gh-pages,
// que o GitHub Pages serve. Builds em container descartável do agente "docker".
pipeline {
  agent { label 'docker' }
  options {
    timestamps()
    ansiColor('xterm')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '60'))
    timeout(time: 15, unit: 'MINUTES')
  }
  stages {
    stage('Build') {
      steps {
        sh 'python3 scripts/fetch_focus.py'
      }
    }
    stage('Publicar no GitHub Pages') {
      when { branch 'main' }
      steps {
        withCredentials([usernamePassword(credentialsId: 'github', usernameVariable: 'GH_USER', passwordVariable: 'GH_TOKEN')]) {
          sh '''
            set -eu
            out=$(mktemp -d)
            cp -a site/. "$out/"
            touch "$out/.nojekyll"
            cd "$out"
            git init -q -b gh-pages
            git config user.name "Jenkins"
            git config user.email "jenkins@caioruiz.com"
            git add -A
            git commit -q -m "Deploy ${GIT_COMMIT}"
            # um commit só, sem histórico: a gh-pages guarda apenas a versão publicada
            git -c credential.helper='!f() { echo username=$GH_USER; echo password=$GH_TOKEN; }; f' \
              push -q -f https://github.com/CaioRuizz/focus.git gh-pages
            echo "Publicado: $(git rev-parse --short HEAD) de ${GIT_COMMIT}"
          '''
        }
      }
    }
  }
}
