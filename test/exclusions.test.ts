import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { exclusionMatcher, normalizeExclusion, normalizeExclusions } from '../src/shared/exclusions'

describe('exclusions', () => {
  it('normalise un chemin saisi', () => {
    assert.equal(normalizeExclusion(' .\\config\\\\perso\\ '), 'config/perso')
    assert.equal(normalizeExclusion('../hors'), null)
    assert.equal(normalizeExclusion('   '), null)
    assert.deepEqual(normalizeExclusions(['Saves', 'saves', 'logs/']), ['Saves', 'logs'])
  })

  it('exclut un dossier avec son contenu, sans tenir compte de la casse', () => {
    const excluded = exclusionMatcher(['saves', 'config/Perso.toml'])
    assert.equal(excluded('saves/Monde/level.dat'), 'saves')
    assert.equal(excluded('SAVES'), 'SAVES')
    assert.equal(excluded('config/perso.toml'), 'config/perso.toml')
    assert.equal(excluded('config/autre.toml'), null)
  })

  it('comprend les jokers', () => {
    const excluded = exclusionMatcher(['**/*.log', 'shaderpacks/*.zip', 'options?.txt'])
    assert.equal(excluded('logs/a/latest.log'), 'logs/a/latest.log')
    assert.equal(excluded('debug.log'), 'debug.log')
    assert.equal(excluded('shaderpacks/BSL.zip'), 'shaderpacks/BSL.zip')
    assert.equal(excluded('shaderpacks/sous/BSL.zip'), null)
    assert.equal(excluded('options1.txt'), 'options1.txt')
  })

  it('n’exclut jamais le fichier du profil', () => {
    assert.equal(exclusionMatcher(['*.json'])('minecraftinstance.json'), null)
    assert.equal(exclusionMatcher(['*.json'])('config/a.json'), null)
    assert.equal(exclusionMatcher(['**/*.json'])('config/a.json'), 'config/a.json')
  })
})
